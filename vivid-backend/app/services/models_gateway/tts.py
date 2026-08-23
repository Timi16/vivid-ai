"""Adapter for the TTS server on RunPod — a dumb endpoint now: text in, audio
out. The clean_for_tts text preparation that used to justify routing through
the 8002 orchestrator lives in the backend (services/tts_text.py), so this
calls the TTS server directly. `voice` selects a Piper voice for en
(amy/grace/hfc) and is ignored by the Nigerian engines."""
import httpx

from app.core.config import settings
from app.services.models_gateway import http
from app.services.tts_text import clean_for_tts

TRANSLATE_LANGS = {"yo", "ig"}


class TTSUnavailable(Exception):
    pass


def speak_language(language: str, translated: bool) -> str:
    # If a yo/ig translation fell back to English, speak with the Nigerian-
    # English voice rather than making the Yoruba voice attempt English.
    if language in TRANSLATE_LANGS:
        return language if translated else "en_ng"
    return language


async def synthesize(text: str, language: str, voice: str | None = None) -> bytes:
    base = (settings.TTS_BASE_URL or settings.ASR_BASE_URL).rstrip("/")
    if not base:
        raise TTSUnavailable("neither TTS_BASE_URL nor ASR_BASE_URL is configured")
    # ORDER INVARIANT: this adapter is the synthesis boundary — callers hand it
    # post-translation text with digits intact (MADLAD copies digits verbatim;
    # spelled-out numbers would break it). Normalization happens here, last,
    # or server-side on the pod once TTS_CLEAN_IN_BACKEND is flipped off.
    text = clean_for_tts(text) if settings.TTS_CLEAN_IN_BACKEND else text.strip()
    if not text:
        raise TTSUnavailable("nothing speakable in the reply")
    data = {"text": text, "lang": language}
    if voice:
        data["voice"] = voice
    try:
        r = await http.client().post(f"{base}/speak", data=data, timeout=180)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise TTSUnavailable(f"TTS request failed: {e}") from e
    # The RunPod servers report failures as 200 + JSON {"error": ...}
    if r.headers.get("content-type", "").startswith("application/json"):
        raise TTSUnavailable(str(r.json().get("error", "tts failed")))
    return r.content
