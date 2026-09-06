"""Adapter for text-to-speech: text in, WAV out.

Two upstreams, chosen by provider.py. Our TTS server on RunPod is a dumb
endpoint (POST /speak): `voice` selects a Piper voice for en (amy/grace/hfc)
and is ignored by the Nigerian engines. OpenRouter's /audio/speech returns
raw 16-bit PCM; the clients play WAV, so the header is added here — the
contract with the frontend does not change with the provider.

The clean_for_tts text preparation that used to justify routing through the
8002 orchestrator lives in the backend (services/tts_text.py), so both paths
call their server directly."""
import io
import wave

import httpx

from app.core.config import settings
from app.services.models_gateway import http, provider
from app.services.tts_text import clean_for_tts

TRANSLATE_LANGS = {"yo", "ig"}


class TTSUnavailable(provider.UpstreamError):
    public = "Voice playback is unavailable right now."


def speak_language(language: str, translated: bool) -> str:
    # If a yo/ig translation fell back to English, speak with the Nigerian-
    # English voice rather than making the Yoruba voice attempt English.
    if language in TRANSLATE_LANGS:
        return language if translated else "en_ng"
    return language


async def synthesize(text: str, language: str, voice: str | None = None) -> bytes:
    ep = provider.endpoint(provider.TTS)
    if not ep.configured:
        raise TTSUnavailable(ep.missing)
    # ORDER INVARIANT: this adapter is the synthesis boundary — callers hand it
    # post-translation text with digits intact (MADLAD copies digits verbatim;
    # spelled-out numbers would break it). Normalization happens here, last,
    # or server-side on the pod once TTS_CLEAN_IN_BACKEND is flipped off.
    text = clean_for_tts(text) if settings.TTS_CLEAN_IN_BACKEND else text.strip()
    if not text:
        raise TTSUnavailable("nothing speakable in the reply",
                             public="There was nothing in that reply to read aloud.")
    if ep.is_pod:
        return await _speak_pod(ep, text, language, voice)
    return await _speak_openrouter(ep, text)


async def _speak_pod(ep: provider.Endpoint, text: str, language: str,
                     voice: str | None) -> bytes:
    data = {"text": text, "lang": language}
    if voice:
        data["voice"] = voice
    try:
        r = await http.client().post(ep.url("/speak"), data=data, timeout=180)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise TTSUnavailable(f"TTS request failed: {e}") from e
    # The RunPod servers report failures as 200 + JSON {"error": ...}
    if r.headers.get("content-type", "").startswith("application/json"):
        raise TTSUnavailable(str(r.json().get("error", "tts failed")))
    return r.content


async def _speak_openrouter(ep: provider.Endpoint, text: str) -> bytes:
    """One OpenRouter voice for every language: there is no Nigerian voice
    to pick, and the client's Piper voice names mean nothing here."""
    payload = {"model": ep.model, "input": text,
               "voice": settings.OPENROUTER_TTS_VOICE,
               "response_format": "pcm"}
    try:
        r = await http.client().post(ep.url("/audio/speech"), json=payload,
                                     headers=ep.headers, timeout=180)
    except httpx.HTTPError as e:
        raise TTSUnavailable(f"TTS request failed: {e}") from e
    if r.status_code >= 400 or r.headers.get("content-type", "").startswith(
            "application/json"):
        raise TTSUnavailable(f"TTS returned {r.status_code}: {_error_text(r)}")
    if not r.content:
        raise TTSUnavailable("TTS returned no audio")
    return pcm_to_wav(r.content, settings.OPENROUTER_TTS_SAMPLE_RATE)


def pcm_to_wav(pcm: bytes, rate: int) -> bytes:
    """16-bit little-endian mono PCM -> WAV, which is what every consumer of
    this adapter (the websocket, storage, _merge_wavs) expects."""
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return out.getvalue()


def _error_text(r: httpx.Response) -> str:
    try:
        error = r.json().get("error")
    except ValueError:
        return r.text[:300]
    if isinstance(error, dict) and error.get("message"):
        return str(error["message"])
    return str(error or r.text[:300])
