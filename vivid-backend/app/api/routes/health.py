import hmac

from fastapi import APIRouter, Request

from app.core.config import settings
from app.services import tools
from app.services.models_gateway import health as models_health

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME,
            "version": settings.APP_VERSION, "env": settings.ENV,
            "tools": sorted(tools.available())}


def _operator(request: Request) -> bool:
    """Did the caller present HEALTH_TOKEN? These routes are unauthenticated
    for the app's sake, so the operator view — which provider serves what,
    our OpenRouter balance, the key's expiry — needs its own gate. An
    unset token means the view does not exist."""
    token = settings.HEALTH_TOKEN
    if not token:
        return False
    header = request.headers.get("authorization", "")
    scheme, _, presented = header.partition(" ")
    return scheme.lower() == "bearer" and hmac.compare_digest(presented, token)


@router.get("/health/models")
async def models_check(request: Request):
    return await models_health.check_all(detail=_operator(request))


@router.get("/health/code")
async def code_check(request: Request):
    """Is the coding model reachable, and is tool calling actually on?

    Worth its own endpoint: vLLM serves happily without
    --enable-auto-tool-choice, and the failure then shows up as an agent that
    narrates what it would do instead of doing anything. The report names
    the provider and model, so it is for operators.
    """
    from app.services.models_gateway import code_llm
    report = await code_llm.probe_tool_support()
    if _operator(request):
        return report
    return {"ok": report["ok"], "tool_calling": report["tool_calling"]}
