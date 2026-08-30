"""Adapter for the coding model (Devstral on RunPod, vLLM, OpenAI-compatible).

Separate from llm.py on purpose: that one serves the Gemma assistant and knows
nothing about tools. This one is the opposite — its whole job is NATIVE tool
calling, which is why the coding agent exists at all. The chat agent recovers
the model's intent by regex-scraping JSON out of prose (services/agent.py);
over a fifty-step coding loop that fails often enough to be useless.

Requires vLLM to have been started with:
    --enable-auto-tool-choice --tool-call-parser mistral
Without those, vLLM ignores `tools` and answers in prose. probe_tool_support()
detects that at startup rather than leaving it to fail mid-session.
"""
import asyncio
import json
import logging

import httpx

from app.core.config import settings
from app.services.models_gateway import http

log = logging.getLogger("vivid.code_llm")


class CodeLLMUnavailable(Exception):
    pass


_TRANSIENT = (httpx.ConnectError, httpx.ConnectTimeout, httpx.RemoteProtocolError,
              httpx.ReadTimeout, httpx.ReadError)
_RETRY_DELAY = 0.5


def _describe(e: Exception) -> str:
    """httpx transport errors frequently carry an empty message — a bare
    "request failed: " tells nobody anything. Fall back to the class name."""
    return str(e) or e.__class__.__name__


def _base() -> str:
    url = settings.CODE_LLM_BASE_URL or settings.LLM_BASE_URL
    if not url:
        raise CodeLLMUnavailable("CODE_LLM_BASE_URL is not configured")
    return url.rstrip("/")


def configured() -> bool:
    return bool(settings.CODE_LLM_BASE_URL or settings.LLM_BASE_URL)


async def stream_chat(messages: list[dict], tools: list[dict],
                      max_tokens: int | None = None):
    """Yields, in order:
        {"type": "token", "text": str}          assistant prose, as it arrives
        {"type": "tool_calls", "calls": [...]}  once, if the turn ended in calls
        {"type": "done", "finish_reason": str, "usage": dict | None}

    Each call is {"id", "name", "arguments"} with arguments already parsed.
    vLLM streams tool calls as fragments keyed by `index` — name arrives on the
    first fragment, the JSON arguments dribble in across later ones — so they
    are reassembled here and emitted only when the turn is complete.
    """
    payload = {
        "model": settings.CODE_LLM_MODEL,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "max_tokens": max_tokens or settings.CODE_MAX_REPLY_TOKENS,
        "temperature": settings.CODE_LLM_TEMPERATURE,
        "top_p": settings.CODE_LLM_TOP_P,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    partial: dict[int, dict] = {}
    usage = None
    finish_reason = None
    yielded = False

    for attempt in (1, 2):
        try:
            async with http.client().stream(
                    "POST", f"{_base()}/chat/completions", json=payload,
                    timeout=settings.CODE_LLM_TIMEOUT) as r:
                if r.status_code >= 400:
                    body = (await r.aread()).decode(errors="replace")[:600]
                    raise CodeLLMUnavailable(
                        f"coding model returned {r.status_code}: {body}")
                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    chunk = json.loads(data)
                    if chunk.get("usage"):
                        usage = chunk["usage"]
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    choice = choices[0]
                    if choice.get("finish_reason"):
                        finish_reason = choice["finish_reason"]
                    delta = choice.get("delta") or {}

                    text = delta.get("content")
                    if text:
                        yielded = True
                        yield {"type": "token", "text": text}

                    for frag in delta.get("tool_calls") or []:
                        yielded = True
                        idx = frag.get("index", 0)
                        slot = partial.setdefault(
                            idx, {"id": None, "name": None, "arguments": ""})
                        if frag.get("id"):
                            slot["id"] = frag["id"]
                        fn = frag.get("function") or {}
                        if fn.get("name"):
                            slot["name"] = fn["name"]
                        if fn.get("arguments"):
                            slot["arguments"] += fn["arguments"]
            break
        except _TRANSIENT as e:
            if yielded or attempt == 2:
                raise CodeLLMUnavailable(
                f"coding model request failed: {_describe(e)}") from e
            await asyncio.sleep(_RETRY_DELAY)
        except (httpx.HTTPError, json.JSONDecodeError) as e:
            raise CodeLLMUnavailable(
                f"coding model request failed: {_describe(e)}") from e

    if partial:
        yield {"type": "tool_calls", "calls": _finalize(partial)}
    yield {"type": "done", "finish_reason": finish_reason, "usage": usage}


def _finalize(partial: dict[int, dict]) -> list[dict]:
    """Reassembled fragments -> calls. A call whose arguments did not parse is
    kept with a parse error rather than dropped: the loop feeds that back as
    the tool result so the model can correct itself, which it reliably does.
    Dropping it instead leaves the model waiting on a result that never comes.
    """
    calls = []
    for idx in sorted(partial):
        slot = partial[idx]
        if not slot["name"]:
            continue
        raw = slot["arguments"].strip() or "{}"
        try:
            args = json.loads(raw)
            error = None
        except json.JSONDecodeError as e:
            args, error = {}, f"arguments were not valid JSON ({e}): {raw[:200]}"
        calls.append({
            "id": slot["id"] or f"call_{idx}",
            "name": slot["name"],
            "arguments": args,
            "error": error,
        })
    return calls


async def probe_tool_support() -> dict:
    """Is the served model reachable AND was vLLM started with tool calling on?

    Sends a one-shot request with a trivial tool the model has no choice but to
    use. A 400 means the flags are missing; prose back means the same thing in
    a friendlier disguise.
    """
    probe_tool = [{
        "type": "function",
        "function": {
            "name": "report_ready",
            "description": "Report that you are ready. Call this immediately.",
            "parameters": {
                "type": "object",
                "properties": {"ok": {"type": "boolean"}},
                "required": ["ok"],
            },
        },
    }]
    try:
        r = await http.client().post(
            f"{_base()}/chat/completions",
            json={
                "model": settings.CODE_LLM_MODEL,
                "messages": [{"role": "user",
                              "content": "Call report_ready with ok=true."}],
                "tools": probe_tool,
                "tool_choice": "auto",
                "max_tokens": 64,
                "temperature": 0,
            },
            timeout=60)
    except httpx.HTTPError as e:
        return {"ok": False, "tool_calling": False, "detail": str(e)}

    if r.status_code >= 400:
        body = r.text[:300]
        hint = ""
        if "tool" in body.lower():
            hint = ("start vLLM with --enable-auto-tool-choice "
                    "--tool-call-parser mistral")
        return {"ok": False, "tool_calling": False,
                "detail": f"HTTP {r.status_code}: {body}", "hint": hint}

    msg = (r.json().get("choices") or [{}])[0].get("message") or {}
    if msg.get("tool_calls"):
        return {"ok": True, "tool_calling": True,
                "model": settings.CODE_LLM_MODEL}
    return {
        "ok": True, "tool_calling": False,
        "detail": "model answered in prose instead of calling the tool",
        "hint": ("vLLM is serving but tool calling is off — restart with "
                 "--enable-auto-tool-choice --tool-call-parser mistral"),
    }
