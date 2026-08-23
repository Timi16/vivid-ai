"""Adapter for the translate path on the ASR server (English -> yo/ig).
Returns the English text unchanged on any failure — the service validates its
own output and falls back rather than shipping garbage."""
import logging

from app.core.config import settings
from app.services.models_gateway import http

log = logging.getLogger("vivid.translate")

TRANSLATE_LANGS = {"yo", "ig"}


async def translate(text: str, language: str) -> str:
    base = (settings.TRANSLATE_BASE_URL or settings.ASR_BASE_URL).rstrip("/")
    if language not in TRANSLATE_LANGS or not text or not base:
        return text
    try:
        r = await http.client().post(f"{base}/translate",
                                     data={"text": text, "lang": language})
        r.raise_for_status()
        return r.json().get("text") or text
    except Exception as e:
        log.warning("translate failed (%s); falling back to English", e)
        return text
