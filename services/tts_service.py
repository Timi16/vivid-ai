"""Text-to-speech model service.

English goes to Piper, not WazobiaVoice: that model is fine-tuned on Nigerian
speech and bleeds Nigerian phonology onto US/UK reference clips. Piper is
English-native and roughly 20x faster.

Piper voices are loaded once and kept resident. Shelling out to the CLI reloads
a 63MB onnx per request -- that cost ~7s a call instead of ~0.2s.
"""
import io, os, logging, threading, hashlib, wave
from collections import OrderedDict

import numpy as np
import torch
import soundfile as sf
from fastapi import FastAPI, Form
from fastapi.responses import Response

logging.basicConfig(level=logging.INFO, force=True)
log = logging.getLogger("vivid.tts")

# perth's watermarker imports as None on some builds; stub it before the model
# is constructed or WazobiaVoice dies on its last init step.
import perth as _perth
if getattr(_perth, "PerthImplicitWatermarker", None) is None:
    class _NoWatermark:
        def apply_watermark(self, wav, sample_rate=None, **kwargs):
            return wav
    _perth.PerthImplicitWatermarker = _NoWatermark
    log.info("perth watermarker unavailable -> no-op stub")

from wazobiavoice_tts.mtl_tts import WazobiaVoiceMultilingualTTS

REF_DIR = "/workspace/models/refs"
PIPER_DIR = "/workspace/models/piper"

# voice id -> (engine, asset, wazobia language_id, exaggeration, cfg_weight)
VOICES = {
    "ronke":    ("wazobia", f"{REF_DIR}/yo.wav",    "yo",  0.5, 0.5),
    "amarachi": ("wazobia", f"{REF_DIR}/ig.wav",    "ig",  0.5, 0.5),
    "esther":   ("wazobia", f"{REF_DIR}/pcm.wav",   "pcm", 0.5, 0.5),
    "cynthia":  ("wazobia", f"{REF_DIR}/en_ng.wav", "en",  0.5, 0.5),
    "amy":      ("piper",   f"{PIPER_DIR}/en_US-amy-medium.onnx",         "en", None, None),
    "grace":    ("piper",   f"{PIPER_DIR}/en_GB-jenny_dioco-medium.onnx", "en", None, None),
}
DEFAULT_VOICE = {"yo": "ronke", "ig": "amarachi", "pcm": "esther",
                 "en_ng": "cynthia", "en": "amy"}
CACHE_MAX = 64

device = "cuda" if torch.cuda.is_available() else "cpu"
log.info("loading WazobiaVoice ...")
model = WazobiaVoiceMultilingualTTS.from_pretrained(device)
log.info("WazobiaVoice ready")

# audio_prompt_path re-embeds the voice on every call; prepare each once.
CONDS = {}
for _v, (_eng, _asset, _lid, _exag, _cfg) in VOICES.items():
    if _eng != "wazobia":
        continue
    if not os.path.isfile(_asset):
        log.warning("reference clip missing for '%s': %s", _v, _asset)
        continue
    try:
        model.prepare_conditionals(_asset, exaggeration=_exag)
        CONDS[_v] = model.conds
        log.info("prepared conditionals for '%s'", _v)
    except Exception as e:
        log.warning("could not prepare '%s': %s", _v, e)

_PIPER = {}
lock = threading.Lock()
_cache: "OrderedDict[str, bytes]" = OrderedDict()
_hits = _misses = 0

app = FastAPI(title="Vivid TTS")


def _finish(wav_np: np.ndarray, sr: int) -> bytes:
    """Trim trailing silence and normalise.

    WazobiaVoice pads to its full token budget: a 3s reply came back as a 14s
    file, so the client's `ended` event fired 11s late. Output is also quiet
    (peak ~0.27), hence the normalise.
    """
    wav_np = np.asarray(wav_np, dtype=np.float32).squeeze()
    win = max(1, int(0.02 * sr))
    usable = len(wav_np) - (len(wav_np) % win)
    if usable >= win:
        env = np.abs(wav_np[:usable]).reshape(-1, win).max(axis=1)
        voiced = np.where(env > 0.01)[0]
        if len(voiced):
            wav_np = wav_np[: min(len(wav_np), (voiced[-1] + 10) * win)]
    peak = float(np.abs(wav_np).max()) if len(wav_np) else 0.0
    if peak > 1e-4:
        wav_np = wav_np * min(0.95 / peak, 8.0)
    buf = io.BytesIO()
    sf.write(buf, wav_np, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _piper(onnx: str):
    v = _PIPER.get(onnx)
    if v is None:
        from piper import PiperVoice
        v = PiperVoice.load(onnx)
        _PIPER[onnx] = v
        log.info("piper voice loaded: %s", os.path.basename(onnx))
    return v


def _speak_piper(text: str, onnx: str) -> bytes:
    v = _piper(onnx)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        v.synthesize_wav(text, wf)
    buf.seek(0)
    wav_np, sr = sf.read(buf, dtype="float32")
    return _finish(wav_np, sr)


def _speak_wazobia(text: str, voice: str) -> bytes:
    _eng, asset, lid, exag, cfg = VOICES[voice]
    with lock:
        with torch.no_grad():
            conds = CONDS.get(voice)
            if conds is not None:
                model.conds = conds
                wav = model.generate(text, language_id=lid,
                                     exaggeration=exag, cfg_weight=cfg)
            else:
                wav = model.generate(text, language_id=lid, audio_prompt_path=asset,
                                     exaggeration=exag, cfg_weight=cfg)
    return _finish(wav.cpu().numpy(), model.sr)


def synthesize(text: str, voice: str) -> bytes:
    engine, asset, *_ = VOICES[voice]
    if engine == "piper":
        if os.path.isfile(asset):
            return _speak_piper(text, asset)
        log.warning("piper asset missing (%s); using cynthia", asset)
        return _speak_wazobia(text, "cynthia")
    return _speak_wazobia(text, voice)


@app.get("/health")
def health():
    return {"ok": True, "service": "tts", "device": device,
            "voices": {v: {"engine": c[0], "language": c[2],
                           "ready": v in CONDS or c[0] == "piper"}
                       for v, c in VOICES.items()},
            "default_voice": DEFAULT_VOICE,
            "cache": {"size": len(_cache), "hits": _hits, "misses": _misses},
            "sample_rate": model.sr}


@app.get("/voices")
def voices():
    return {"voices": list(VOICES), "default_voice": DEFAULT_VOICE}


@app.post("/speak")
def speak(text: str = Form(...), lang: str = Form("en"), voice: str = Form(None)):
    global _hits, _misses
    voice = voice if voice in VOICES else DEFAULT_VOICE.get(lang, "amy")
    text = text.strip()
    if not text:
        return Response(content=b"", media_type="audio/wav")

    key = hashlib.sha1(f"{voice}\x00{text}".encode()).hexdigest()
    hit = _cache.get(key)
    if hit is not None:
        _cache.move_to_end(key)
        _hits += 1
        return Response(content=hit, media_type="audio/wav")

    _misses += 1
    data = synthesize(text, voice)
    _cache[key] = data
    if len(_cache) > CACHE_MAX:
        _cache.popitem(last=False)
    return Response(content=data, media_type="audio/wav")


@app.post("/cache/clear")
def cache_clear():
    _cache.clear()
    return {"ok": True}


log.info("warming up ...")
for _v in ("amy", "cynthia"):
    try:
        synthesize("Warm up.", _v)
    except Exception as e:
        log.warning("warm-up failed for %s: %s", _v, e)
_cache.clear()
log.info("tts-service ready")
