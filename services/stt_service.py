"""Speech-to-text model service.

Model serving only: transcribe and detect. Sessions, prompts, the tool loop and
the conversation pipeline live in the backend now -- this process just turns
audio into text.

Adapters are LoRA fine-tunes for Yoruba, Igbo and Nigerian Pidgin. Each one's
base model is read from its own adapter_config.json rather than hardcoded,
because they were trained against different bases (large-v3 and small) and
guessing wrong produces silent garbage rather than an error.
"""
import io, json, logging, threading
from pathlib import Path

import numpy as np
import torch
import librosa
from fastapi import FastAPI, UploadFile, File, Form
from transformers import WhisperForConditionalGeneration, WhisperProcessor
from peft import PeftModel

logging.basicConfig(level=logging.INFO, force=True)
log = logging.getLogger("vivid.stt")

ADAPTER_DIR = Path("/workspace/adapters")
ADAPTERS = {"yo": "yo", "ig": "ig", "pcm": "pcm"}     # lang -> subdirectory
FALLBACK_BASE = "openai/whisper-large-v3"
SAMPLE_RATE = 16000
MIN_SAMPLES = SAMPLE_RATE // 10

# Whisper's language head knows yo and en from our set; it has no Igbo at all
# and hears Pidgin as English, so auto-detect finishes the job with transcript
# vocabulary.
DETECTABLE = ("yo", "en", "ha", "sw", "fr", "ar")
import re
_PIDGIN = re.compile(r"\b(dey|wetin|abeg|na|sabi|wahala|oga|comot|una|dem|"
                     r"no be|make i|how far|shey|jare|chop|waka)\b", re.I)
_IGBO = re.compile(r"\b(kedu|ndewo|biko|daalụ|gịnị|maka|nna|nne|ka m|ọ dị|"
                   r"nwoke|nwanyị|ihe|ọma|nke|ndị)\b|[ịụṅ]", re.I)

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32

bases: dict = {}          # base id -> model (adapters attached)
processors: dict = {}
lang_base: dict = {}      # lang -> base id
gpu_lock = threading.Lock()


def _base_of(adapter_path: Path) -> str:
    cfg = adapter_path / "adapter_config.json"
    if cfg.exists():
        name = json.loads(cfg.read_text()).get("base_model_name_or_path")
        if name:
            return name
    return FALLBACK_BASE


def _load_base(name: str):
    if name in bases:
        return
    log.info("loading base %s", name)
    bases[name] = WhisperForConditionalGeneration.from_pretrained(
        name, torch_dtype=dtype).to(device)
    processors[name] = WhisperProcessor.from_pretrained(name)


for _lang, _sub in ADAPTERS.items():
    path = ADAPTER_DIR / _sub
    if not path.exists():
        log.warning("adapter for '%s' not found at %s -- skipping", _lang, path)
        continue
    base = _base_of(path)
    _load_base(base)
    if isinstance(bases[base], PeftModel):
        bases[base].load_adapter(str(path), adapter_name=_lang)
    else:
        bases[base] = PeftModel.from_pretrained(bases[base], str(path),
                                                adapter_name=_lang)
    lang_base[_lang] = base
    log.info("adapter '%s' on %s", _lang, base)

_load_base(FALLBACK_BASE)                     # bare model for English
for m in bases.values():
    m.eval()

# faster-whisper is CTranslate2: ~4x quicker for the same weights, but it cannot
# load PEFT adapters -- English only.
FW = None
try:
    from faster_whisper import WhisperModel
    FW = WhisperModel("large-v3", device=device,
                      compute_type="int8_float16" if device == "cuda" else "int8")
    log.info("faster-whisper ready (English path)")
except Exception as e:
    log.warning("faster-whisper unavailable (%s); English uses transformers", e)

app = FastAPI(title="Vivid STT")


def _decode(raw: bytes) -> np.ndarray:
    wav, _ = librosa.load(io.BytesIO(raw), sr=SAMPLE_RATE, mono=True)
    return wav.astype(np.float32)


def _features(audio: np.ndarray, base: str):
    return processors[base](audio, sampling_rate=SAMPLE_RATE,
                            return_tensors="pt").input_features.to(device, dtype)


def transcribe(audio: np.ndarray, lang: str) -> str:
    if lang in ("en", "en_ng") and FW is not None:
        with gpu_lock:
            segs, _ = FW.transcribe(audio, language="en", beam_size=1,
                                    vad_filter=False,
                                    condition_on_previous_text=False)
            return " ".join(s.text for s in segs).strip()

    base = lang_base.get(lang, FALLBACK_BASE)
    feats = _features(audio, base)
    model = bases[base]
    with gpu_lock:
        with torch.no_grad():
            if lang in lang_base:
                model.set_adapter(lang)
                ids = model.generate(feats, max_new_tokens=256)
            elif isinstance(model, PeftModel):
                with model.disable_adapter():
                    ids = model.generate(feats, max_new_tokens=256)
            else:
                ids = model.generate(feats, max_new_tokens=256)
    return processors[base].batch_decode(ids, skip_special_tokens=True)[0].strip()


def detect_lang(audio: np.ndarray) -> str:
    """One decoder step on the bare model: the first token after
    <|startoftranscript|> is the language."""
    base = FALLBACK_BASE
    proc = processors[base]
    tok = proc.tokenizer
    feats = _features(audio, base)
    sot = tok.convert_tokens_to_ids("<|startoftranscript|>")
    ids = {l: tok.convert_tokens_to_ids(f"<|{l}|>") for l in DETECTABLE}
    dec = torch.tensor([[sot]], device=device)
    model = bases[base]
    with gpu_lock:
        with torch.no_grad():
            if isinstance(model, PeftModel):
                with model.disable_adapter():
                    logits = model(input_features=feats, decoder_input_ids=dec).logits[0, -1]
            else:
                logits = model(input_features=feats, decoder_input_ids=dec).logits[0, -1]
    return max(ids, key=lambda l: logits[ids[l]].item())


def transcribe_auto(audio: np.ndarray) -> tuple[str, str]:
    if detect_lang(audio) == "yo" and "yo" in lang_base:
        return transcribe(audio, "yo"), "yo"
    text = transcribe(audio, "en")
    if "ig" in lang_base and _IGBO.search(text):
        return transcribe(audio, "ig"), "ig"
    if "pcm" in lang_base and _PIDGIN.search(text):
        return transcribe(audio, "pcm"), "pcm"
    return text, "en"


@app.get("/health")
def health():
    return {"ok": True, "service": "stt", "device": device,
            "adapters": sorted(lang_base), "bases": sorted(bases),
            "faster_whisper": FW is not None,
            "languages": sorted(set(lang_base) | {"en", "en_ng"})}


@app.post("/transcribe")
async def transcribe_http(audio: UploadFile = File(...), lang: str = Form("auto")):
    known = set(lang_base) | {"en", "en_ng", "auto"}
    if lang not in known:
        return {"error": f"unknown lang '{lang}', use {sorted(known)}"}
    try:
        wav = _decode(await audio.read())
    except Exception as e:
        return {"error": f"could not decode audio: {e}"}
    if len(wav) < MIN_SAMPLES:
        return {"error": "audio too short"}
    if lang == "auto":
        text, detected = transcribe_auto(wav)
        return {"text": text, "language": detected, "auto": True}
    return {"text": transcribe(wav, lang), "language": lang, "auto": False}


@app.post("/detect")
async def detect_http(audio: UploadFile = File(...)):
    try:
        wav = _decode(await audio.read())
    except Exception as e:
        return {"error": f"could not decode audio: {e}"}
    text, lang = transcribe_auto(wav)
    return {"language_head": detect_lang(wav), "language": lang, "text": text}
