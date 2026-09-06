"""Health poll of every model service (spec section 5): the UI uses this to
show 'models warming up' instead of failing cold.

Two views of the same poll. The public one is ok/status per service and
nothing else — the web app calls it unauthenticated, and which upstream is
behind a service, or what our account there holds, is not the public's
business. The detailed one (an operator with HEALTH_TOKEN) adds the provider
and model per service and the OpenRouter account entry.
"""
import asyncio

from app.core.config import settings
from app.services.models_gateway import http, provider


async def _check(name: str, url: str, headers: dict | None = None,
                 extra: dict | None = None) -> tuple[str, dict]:
    """`extra` rides along on the entry so an operator can see WHICH upstream
    was checked; the ok/status pair the UI reads is unchanged."""
    extra = extra or {}
    if not url:
        return name, {"ok": False, "status": "not configured", **extra}
    try:
        r = await http.client().get(url, timeout=5, headers=headers or {})
        return name, {"ok": r.status_code == 200, "status": r.status_code, **extra}
    except Exception as e:
        # An httpx message can carry the host it failed to reach.
        return name, {"ok": False, "status": provider.scrub(str(e) or "unreachable"),
                      **extra}


def _provider_check(name: str, role: str, pod_path: str, detail: bool):
    """One probe per role, whichever way the switch is set. A pod answers on
    its own health path; OpenRouter answers GET /models on the shared root.
    OpenRouter's listing is public, but the key is sent anyway: a rejected
    key should show up here, not on the first turn."""
    ep = provider.endpoint(role)
    path = pod_path if ep.is_pod else "/models"
    return _check(name, ep.url(path) if ep.configured else "",
                  headers=ep.headers,
                  extra=provider.describe(role) if detail else None)


async def openrouter_account() -> dict | None:
    """The OpenRouter account behind the switch, when anything is routed
    there. None otherwise, so a pods-only deployment reports nothing.

    Reachability alone would say "ok" with an empty balance, and OpenRouter
    serves LLM calls on an empty balance but refuses audio below a minimum —
    so the balance and the key's expiry are the facts an operator flipping
    the switch actually needs, and they belong here rather than in the first
    voice turn's error message.
    """
    roles = [r for r in provider.ROLES
             if provider.provider_for(r) == provider.OPENROUTER]
    if not roles:
        return None
    ep = provider.endpoint(roles[0])
    entry: dict = {"roles": roles}
    if not ep.configured:
        return {"ok": False, "status": ep.missing, **entry}
    try:
        credits = await http.client().get(ep.url("/credits"), headers=ep.headers,
                                          timeout=5)
        key = await http.client().get(ep.url("/auth/key"), headers=ep.headers,
                                      timeout=5)
    except Exception as e:
        return {"ok": False, "status": str(e), **entry}
    if credits.status_code != 200:
        return {"ok": False, "status": credits.status_code, **entry}
    data = credits.json().get("data") or {}
    balance = round(float(data.get("total_credits") or 0)
                    - float(data.get("total_usage") or 0), 4)
    entry.update({
        "balance_usd": balance,
        "audio_ready": balance >= settings.OPENROUTER_AUDIO_MIN_BALANCE,
        "audio_min_balance_usd": settings.OPENROUTER_AUDIO_MIN_BALANCE,
    })
    if key.status_code == 200:
        key_data = key.json().get("data") or {}
        entry["key_expires_at"] = key_data.get("expires_at")
        entry["free_tier"] = bool(key_data.get("is_free_tier"))
    return {"ok": True, "status": 200, **entry}


async def check_all(detail: bool = False) -> dict:
    """ok/status per service; with `detail`, also which provider and model
    serve each role and the OpenRouter account entry."""
    trans = (settings.TRANSLATE_BASE_URL or settings.ASR_BASE_URL).rstrip("/")
    tools_url = settings.VIVID_TOOLS_URL.rstrip("/")
    sandbox_url = settings.SANDBOX_URL.rstrip("/")
    reranker = settings.RERANKER_URL.rstrip("/")
    checks = [
        _provider_check("llm", provider.CHAT, "/models", detail),
        _provider_check("code_llm", provider.CODE, "/models", detail),
        _provider_check("asr", provider.ASR, "/health", detail),
        _provider_check("tts", provider.TTS, "/health", detail),
        _check("translate", f"{trans}/health" if trans else ""),
        _check("embeddings", settings.EMBEDDINGS_URL),
        _check("reranker", f"{reranker}/health" if reranker else ""),
        _check("browser", f"{tools_url}/health" if tools_url else ""),
        _check("sandbox", f"{sandbox_url}/health" if sandbox_url else ""),
    ]
    results = dict(await asyncio.gather(*checks))
    if detail:
        account = await openrouter_account()
        if account is not None:
            results["openrouter"] = account
    return results
