from fastapi import APIRouter

from app.core.config import settings
from app.services import tools
from app.services.models_gateway import health as models_health

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME,
            "version": settings.APP_VERSION, "env": settings.ENV,
            "tools": sorted(tools.available())}


@router.get("/health/models")
async def models_check():
    return await models_health.check_all()


@router.get("/health/code")
async def code_check():
    """Is the coding model reachable, and is tool calling actually on?

    Worth its own endpoint: vLLM serves happily without
    --enable-auto-tool-choice, and the failure then shows up as an agent that
    narrates what it would do instead of doing anything.
    """
    from app.services.models_gateway import code_llm
    return await code_llm.probe_tool_support()
