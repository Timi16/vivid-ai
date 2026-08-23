"""Adapter for the STT server on RunPod (POST /transcribe) — a dumb endpoint:
audio in, text out. Supports lang="auto": the server picks the language
(Whisper language head + transcript vocabulary for the ig/pcm split) and
reports what it detected."""
import httpx

from app.core.config import settings
from app.services.models_gateway import http


class STTUnavailable(Exception):
    pass


async def transcribe(audio_bytes: bytes, language: str,
                     mime: str = "audio/webm") -> tuple[str, str]:
    """Returns (text, detected_language)."""
    if not settings.ASR_BASE_URL:
        raise STTUnavailable("ASR_BASE_URL is not configured")
    base = settings.ASR_BASE_URL.rstrip("/")
    try:
        r = await http.client().post(
            f"{base}/transcribe",
            files={"audio": ("audio", audio_bytes, mime)},
            data={"lang": language})
        r.raise_for_status()
        body = r.json()
    except httpx.HTTPError as e:
        raise STTUnavailable(f"STT request failed: {e}") from e
    # The server reports failures as 200 + {"error": ...}
    if body.get("error"):
        raise STTUnavailable(body["error"])
    text = (body.get("text") or "").strip()
    detected = body.get("language") or (language if language != "auto" else "en")
    return text, detected
