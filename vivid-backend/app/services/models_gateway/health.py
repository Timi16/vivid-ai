"""Health poll of every model service (spec section 5): the UI uses this to
show 'models warming up' instead of failing cold."""
import asyncio

from app.core.config import settings
from app.services.models_gateway import http


async def _check(name: str, url: str) -> tuple[str, dict]:
    if not url:
        return name, {"ok": False, "status": "not configured"}
    try:
        r = await http.client().get(url, timeout=5)
        return name, {"ok": r.status_code == 200, "status": r.status_code}
    except Exception as e:
        return name, {"ok": False, "status": str(e)}


async def check_all() -> dict:
    asr = settings.ASR_BASE_URL.rstrip("/")
    tts = (settings.TTS_BASE_URL or settings.ASR_BASE_URL).rstrip("/")
    trans = (settings.TRANSLATE_BASE_URL or settings.ASR_BASE_URL).rstrip("/")
    llm = settings.LLM_BASE_URL.rstrip("/")
    checks = [
        _check("llm", f"{llm}/models" if llm else ""),
        _check("asr", f"{asr}/health" if asr else ""),
        _check("tts", f"{tts}/health" if tts else ""),
        _check("translate", f"{trans}/health" if trans else ""),
        _check("embeddings", settings.EMBEDDINGS_URL),
    ]
    return dict(await asyncio.gather(*checks))
