from fastapi import APIRouter

from ..browser.pool import pool
from ..config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    cfg = settings()
    return {"ok": True, "service": "vivid-tools",
            "sessions": pool.count, "max_sessions": cfg.max_sessions,
            "auth": bool(cfg.token)}
