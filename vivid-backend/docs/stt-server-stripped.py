# The 8002 service, stripped to a dumb model endpoint: audio in -> text out.
# No service on the pod knows what a conversation is any more — sessions,
# prompts, the tool loop, translation routing, TTS glue and streaming all
# live in the backend (vivid-backend). What remains here is exactly the work
# that needs the GPU: Whisper + adapters, and language detection (which stays
# at the STT boundary because the ig/pcm split needs the intermediate
# transcripts — doing it off-pod would cost extra round trips).
#
# Endpoints: POST /transcribe (lang=<code>|auto), POST /detect (debug),
# GET /health. The backend calls /transcribe and /health only.
import io, logging, re, threading, asyncio

import numpy as np
import torch
import librosa
from fastapi import FastAPI, UploadFile, File, Form
from transformers import WhisperForConditionalGeneration, WhisperProcessor
from peft import PeftModel

log = logging.getLogger("vivid.stt")
logging.basicConfig(level=logging.INFO, force=True)

# ---------------- config ----------------
LANGS = {
    "yo":    ("openai/whisper-large-v3", "/workspace/models/stt-adapters/yo"),
    "ig":    ("openai/whisper-large-v3", "/workspace/models/stt-adapters/ig"),
    "pcm":   ("openai/whisper-small",    "/workspace/models/stt-adapters/pcm_small"),
    "en":    ("openai/whisper-large-v3", None),
    "en_ng": ("openai/whisper-large-v3", None),
}
BASE_MODEL = "openai/whisper-large-v3"
SAMPLE_RATE = 16000

# ---------------- language detection ----------------
# Whisper's language head covers yo and en from our set; it has no Igbo at all
# and hears Pidgin as English. So detection is two stages: one cheap decoder
# step on the audio, then transcript vocabulary to split the English-ish bucket.
DETECTABLE = ("yo", "en", "ha", "sw", "fr", "ar")
_PIDGIN = re.compile(r"\b(dey|wetin|abeg|na|sabi|wahala|oga|comot|una|dem|"
                     r"no be|make i|how far|shey|jare|chop|waka)\b", re.I)
_IGBO = re.compile(r"\b(kedu|ndewo|biko|daalụ|gịnị|maka|nna|nne|ka m|ọ dị|"
                   r"nwoke|nwanyị|ihe|ọma|nke|ndị)\b|[ịụṅ]", re.I)

# ---------------- model loading ----------------
device = "cuda"
bases, models, processors = {}, {}, {}

for lang, (base_name, adapter_path) in LANGS.items():
    if base_name not in bases:
        print(f"Loading base {base_name} ...")
        bases[base_name] = WhisperForConditionalGeneration.from_pretrained(
            base_name, torch_dtype=torch.float16).to(device)
        processors[base_name] = WhisperProcessor.from_pretrained(base_name)
    if adapter_path is None:
        print(f"Language '{lang}' uses bare {base_name} (no adapter)")
        continue
    if base_name not in models:
        models[base_name] = PeftModel.from_pretrained(
            bases[base_name], adapter_path, adapter_name=lang)
    else:
        models[base_name].load_adapter(adapter_path, adapter_name=lang)
    print(f"Loaded adapter '{lang}' on {base_name}")

for m in models.values():
    m.eval()

gpu_lock = threading.Lock()

app = FastAPI()


def _features(pcm_bytes: bytes, base_name: str):
    audio = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    return processors[base_name](audio, sampling_rate=SAMPLE_RATE,
                                 return_tensors="pt").input_features.to(
                                     device, torch.float16)


def transcribe(pcm_bytes: bytes, lang: str) -> str:
    base_name, adapter_path = LANGS[lang]
    feats = _features(pcm_bytes, base_name)
    with gpu_lock:
        with torch.no_grad():
            if adapter_path is None:
                m = models.get(base_name)
                if m is not None:
                    with m.disable_adapter():
                        ids = m.generate(feats, max_new_tokens=256)
                else:
                    ids = bases[base_name].generate(feats, max_new_tokens=256)
            else:
                m = models[base_name]
                m.set_adapter(lang)
                ids = m.generate(feats, max_new_tokens=256)
    return processors[base_name].batch_decode(ids, skip_special_tokens=True)[0].strip()


def detect_lang(pcm_bytes: bytes) -> str:
    """Whisper's language head: the first token after <|startoftranscript|> is
    the language. One decoder step (~0.3s) instead of a full transcription."""
    processor = processors[BASE_MODEL]
    tokenizer = processor.tokenizer
    feats = _features(pcm_bytes, BASE_MODEL)
    sot = tokenizer.convert_tokens_to_ids("<|startoftranscript|>")
    ids = {l: tokenizer.convert_tokens_to_ids(f"<|{l}|>") for l in DETECTABLE}
    dec = torch.tensor([[sot]], device=device)

    m = models.get(BASE_MODEL) or bases[BASE_MODEL]
    with gpu_lock:
        with torch.no_grad():
            if hasattr(m, "disable_adapter"):
                with m.disable_adapter():
                    logits = m(input_features=feats, decoder_input_ids=dec).logits[0, -1]
            else:
                logits = m(input_features=feats, decoder_input_ids=dec).logits[0, -1]
    best = max(ids, key=lambda l: logits[ids[l]].item())
    log.info("language head: %s", best)
    return best


def transcribe_auto(pcm_bytes: bytes) -> "tuple[str, str]":
    hint = detect_lang(pcm_bytes)
    if hint == "yo":
        return transcribe(pcm_bytes, "yo"), "yo"
    text = transcribe(pcm_bytes, "en")
    if _IGBO.search(text):
        return transcribe(pcm_bytes, "ig"), "ig"
    if _PIDGIN.search(text):
        return transcribe(pcm_bytes, "pcm"), "pcm"
    return text, "en"


def _decode_upload(raw: bytes):
    """Any container librosa can read -> 16k mono int16 PCM, or an error dict."""
    try:
        wav, _ = librosa.load(io.BytesIO(raw), sr=SAMPLE_RATE, mono=True)
    except Exception as e:
        return None, {"error": f"could not decode audio: {e}"}
    if len(wav) < SAMPLE_RATE // 10:
        return None, {"error": "audio too short"}
    return (np.clip(wav, -1, 1) * 32767).astype(np.int16).tobytes(), None


@app.get("/health")
def health():
    return {
        "ok": True,
        "languages": list(LANGS),
        "auto_detect": {"enabled": True, "head_langs": list(DETECTABLE),
                        "note": "whisper has no Igbo; ig/pcm split by transcript"},
        "base_model": BASE_MODEL,
    }


@app.post("/detect")
async def detect_http(audio: UploadFile = File(...)):
    pcm, err = _decode_upload(await audio.read())
    if err:
        return err
    head = await asyncio.to_thread(detect_lang, pcm)
    text, lang = await asyncio.to_thread(transcribe_auto, pcm)
    return {"language_head": head, "final_language": lang, "text": text}


@app.post("/transcribe")
async def transcribe_http(audio: UploadFile = File(...), lang: str = Form("auto")):
    if lang != "auto" and lang not in LANGS:
        return {"error": f"unknown lang '{lang}', use {list(LANGS)} or 'auto'"}
    pcm, err = _decode_upload(await audio.read())
    if err:
        return err
    if lang == "auto":
        text, detected = await asyncio.to_thread(transcribe_auto, pcm)
        return {"text": text, "language": detected, "auto": True}
    return {"text": await asyncio.to_thread(transcribe, pcm, lang),
            "language": lang, "auto": False}
