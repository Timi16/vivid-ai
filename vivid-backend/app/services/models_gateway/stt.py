"""Adapter for speech-to-text: audio in, (text, detected language) out.

Two upstreams, chosen by provider.py. Our STT server on RunPod is a dumb
endpoint (POST /transcribe) that supports lang="auto": the server picks the
language (Whisper language head + transcript vocabulary for the ig/pcm split)
and reports what it detected. OpenRouter's /audio/transcriptions is the
OpenAI shape: a multipart file, an optional language hint, and the detected
language only when verbose_json is asked for."""
import httpx

from app.core.config import settings
from app.services.models_gateway import http, provider


class STTUnavailable(Exception):
    pass


#: Multipart filename extensions per mime. OpenRouter sniffs the format from
#: the name, and a bare "audio" is a 400.
_EXT = {"audio/webm": "webm", "audio/wav": "wav", "audio/x-wav": "wav",
        "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/ogg": "ogg",
        "audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a",
        "audio/flac": "flac", "audio/aac": "aac"}

#: Whisper-style verbose_json names the language in full ("english"); the
#: rest of the pipeline speaks ISO codes, and the voice persona is picked by
#: code. Unknown names fall back to what was requested.
_LANGUAGE_NAMES = {"english": "en", "yoruba": "yo", "igbo": "ig",
                   "hausa": "ha", "french": "fr", "pidgin": "pcm",
                   "nigerian pidgin": "pcm"}


async def transcribe(audio_bytes: bytes, language: str,
                     mime: str = "audio/webm") -> tuple[str, str]:
    """Returns (text, detected_language)."""
    ep = provider.endpoint(provider.ASR)
    if not ep.configured:
        raise STTUnavailable(ep.missing)
    if ep.is_pod:
        return await _transcribe_pod(ep, audio_bytes, language, mime)
    return await _transcribe_openrouter(ep, audio_bytes, language, mime)


async def _transcribe_pod(ep: provider.Endpoint, audio_bytes: bytes,
                          language: str, mime: str) -> tuple[str, str]:
    try:
        r = await http.client().post(
            ep.url("/transcribe"),
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


async def _transcribe_openrouter(ep: provider.Endpoint, audio_bytes: bytes,
                                 language: str, mime: str) -> tuple[str, str]:
    ext = _EXT.get(mime.split(";")[0].strip().lower(), "webm")
    data = {"model": ep.model, "response_format": "verbose_json"}
    if language in settings.OPENROUTER_STT_LANGUAGES:
        data["language"] = language
    try:
        r = await http.client().post(
            ep.url("/audio/transcriptions"),
            files={"file": (f"audio.{ext}", audio_bytes, mime)},
            data=data, headers=ep.headers)
    except httpx.HTTPError as e:
        raise STTUnavailable(f"STT request failed: {e}") from e
    if r.status_code >= 400:
        raise STTUnavailable(
            f"STT returned {r.status_code}: {_error_text(r)}")
    try:
        body = r.json()
    except ValueError as e:
        raise STTUnavailable(f"STT returned an unreadable response: {e}") from e
    if body.get("error"):
        raise STTUnavailable(_error_text(r))
    text = (body.get("text") or "").strip()
    fallback = language if language != "auto" else "en"
    return text, _language_code(body.get("language"), fallback)


def _language_code(reported, fallback: str) -> str:
    if not isinstance(reported, str) or not reported.strip():
        return fallback
    reported = reported.strip().lower()
    if reported in _LANGUAGE_NAMES:
        return _LANGUAGE_NAMES[reported]
    # Already a code ("en", "yo", "pcm"): keep it. A longer, unknown name is
    # not something the voice router can act on.
    return reported if len(reported) <= 3 else fallback


def _error_text(r: httpx.Response) -> str:
    try:
        error = r.json().get("error")
    except ValueError:
        return r.text[:300]
    if isinstance(error, dict) and error.get("message"):
        return str(error["message"])
    return str(error or r.text[:300])
