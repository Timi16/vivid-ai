"""English -> Yoruba / Igbo translation service.

Why a dedicated MT model rather than the LLM: Gemma writes fluent-looking yo/ig
with wrong content -- it mislabelled 25.3°C as humidity, spelled 135,864 into
gibberish, and rendered "25.3" as the words for 58 and 50 when asked to
translate. MADLAD-400 is an encoder-decoder trained on parallel text: numbers
pass through byte-identical and it does not invent facts.

MADLAD strips Yoruba tone marks, so yo gets a second pass through ADR (see
adr.py, which masks numbers because the ADR model rewrote "84%" as "79,").
Igbo needs no ADR: MADLAD already emits the dot-below vowels Igbo orthography
requires, and Igbo tone marks are optional in everyday text.

Three guards, all learned the hard way:
  1. Short inputs make MADLAD degenerate into web-scrape junk -- "Good morning!"
     came back as "Abercrombie & Fitch 2019-03-06" and "Hello there." as Danish
     shopping spam. Greetings never reach the model.
  2. Splitting short text into sentences CAUSED that degeneration by making the
     fragments shorter still. Only long text is split.
  3. Nothing leaves unvalidated. English is a poor fallback; a Danish advert
     spoken in a Yoruba voice is a much worse one.

A self-test runs at startup and reports through /health, because a previous
deployment served corrupted weights for days while every request silently fell
back to English.

Serving note: run with ONE uvicorn worker. The global lock is the queue;
extra workers would each load their own ~6GB MADLAD copy for no throughput
gain. Configuration is bf16 (the reference config) -- int8 was exonerated as
the cause of past garbage, but bf16 stays until /selftest has been green for
a while; then port to CT2 int8 for latency, protected by the same self-test.
"""
import hashlib, logging, re, threading

import torch
from fastapi import FastAPI, Form
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

import adr

logging.basicConfig(level=logging.INFO, force=True)
log = logging.getLogger("vivid.translate")

MADLAD = "google/madlad400-3b-mt"
TARGETS = {"yo": "<2yo>", "ig": "<2ig>"}
ADR_LANGS = {"yo"}
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CACHE_MAX = 128
SPLIT_OVER = 200           # only split genuinely long text

# no_repeat_ngram_size kills the "lọ́wọ́lọ́wọ́ x20" degeneration seen at 4 beams.
GEN = dict(max_new_tokens=256, num_beams=4, no_repeat_ngram_size=4,
           repetition_penalty=1.15, early_stopping=True)

_SENT = re.compile(r"(?<=[.!?])\s+")

PHRASEBOOK = {
    "yo": {
        "good morning": "Ẹ káàrọ̀!", "good afternoon": "Ẹ káàsán!",
        "good evening": "Ẹ kúùrọ̀lẹ́!", "hello": "Ẹ n lẹ́!", "hi": "Ẹ n lẹ́!",
        "how can i help you today": "Kí ni mo lè ràn ọ́ lọ́wọ́?",
        "how can i help you": "Kí ni mo lè ràn ọ́ lọ́wọ́?",
        "youre welcome": "Ẹ ò tọ́pẹ́.", "thank you": "Ẹ ṣé.",
        "im doing well thanks": "Mo wà dáadáa, ẹ ṣé.",
        "goodbye": "Ó dàbọ̀.", "yes": "Bẹ́ẹ̀ ni.", "no": "Bẹ́ẹ̀ kọ́.",
    },
    "ig": {
        "good morning": "Ụtụtụ ọma!", "good afternoon": "Ehihie ọma!",
        "good evening": "Mgbede ọma!", "hello": "Ndewo!", "hi": "Ndewo!",
        "how can i help you today": "Kedu ka m ga-esi nyere gị aka?",
        "how can i help you": "Kedu ka m ga-esi nyere gị aka?",
        "youre welcome": "Ọ dịghị ihe ọ bụ.", "thank you": "Daalụ.",
        "im doing well thanks": "Adị m mma, daalụ.",
        "goodbye": "Ka ọ dị.", "yes": "Ee.", "no": "Mba.",
    },
}

_JUNK = re.compile(r"(©|\ball rights reserved\b|https?://|www\.|@\w+|"
                   r"\bcopyright\b|\bkøb\b|\d{4}-\d{2}-\d{2}|"
                   r"abercrombie|\bfitch\b)", re.I)

# ---------------------------------------------------------------- model load
log.info("loading MADLAD-400 ...")
tok = AutoTokenizer.from_pretrained(MADLAD)

try:
    model = AutoModelForSeq2SeqLM.from_pretrained(MADLAD, dtype=torch.bfloat16)
except TypeError:                                    # older transformers
    model = AutoModelForSeq2SeqLM.from_pretrained(MADLAD,
                                                  torch_dtype=torch.bfloat16)
model = model.to(DEVICE)
model.eval()

# A truncated download passes every config check and still produces token soup.
# Compare what the weights actually carry against what the tokenizer expects.
EMB_ROWS = model.get_input_embeddings().weight.shape[0]
VOCAB_OK = EMB_ROWS >= len(tok)
log.info("MADLAD ready on %s | tokenizer %d | embedding rows %d | vocab_ok %s",
         model.device, len(tok), EMB_ROWS, VOCAB_OK)

try:
    adr.load(device=DEVICE)
    ADR_OK = adr.ready()
except Exception as e:
    log.warning("ADR unavailable (%s); Yoruba will be undiacritised", e)
    ADR_OK = False

lock = threading.Lock()
_cache: "dict[str, str]" = {}
_order: list = []
_stats = {"hits": 0, "misses": 0, "canned": 0, "rejected": 0}

app = FastAPI(title="Vivid Translate")


def _key(text: str, lang: str) -> str:
    return hashlib.sha1(f"{lang}\x00{text}".encode("utf-8")).hexdigest()


def _cache_get(text: str, lang: str):
    k = _key(text, lang)
    if k in _cache:
        _stats["hits"] += 1
        _order.remove(k); _order.append(k)          # LRU touch
        return _cache[k]
    _stats["misses"] += 1
    return None


def _cache_put(text: str, lang: str, out: str) -> None:
    k = _key(text, lang)
    if k in _cache:
        _order.remove(k)
    _cache[k] = out
    _order.append(k)
    while len(_order) > CACHE_MAX:
        _cache.pop(_order.pop(0), None)


def _phrase(text: str, lang: str) -> str:
    key = re.sub(r"[^\w\s]", "", text.lower()).strip()
    return PHRASEBOOK.get(lang, {}).get(key, "")


def _suspect(src: str, out: str) -> str:
    """Empty string means the translation is trustworthy."""
    if not out.strip():
        return "empty"
    if _JUNK.search(out) and not _JUNK.search(src):
        return "boilerplate"
    if re.findall(r"\d+", src) != re.findall(r"\d+", out):
        return "numbers changed"
    if len(out) > 4 * len(src) + 40:
        return "runaway length"
    return ""


def _mt(sentence: str, lang: str) -> str:
    ids = tok(f"{TARGETS[lang]} {sentence}",
              return_tensors="pt").input_ids.to(model.device)
    with torch.no_grad():
        out = model.generate(ids, **GEN)
    return tok.decode(out[0], skip_special_tokens=True).strip()


def translate(text: str, lang: str) -> tuple[str, str]:
    """Returns (output, reason). reason is '' on success, 'canned' for a
    phrasebook hit, 'cached' for a cache hit, or the rejection cause when
    falling back to English."""
    text = text.strip()
    if not text or lang not in TARGETS:
        return text, ""

    canned = _phrase(text, lang)
    if canned:
        _stats["canned"] += 1
        return canned, "canned"

    with lock:
        hit = _cache_get(text, lang)
        if hit is not None:
            return hit, "cached"

        chunks = ([s for s in _SENT.split(text) if s.strip()]
                  if len(text) > SPLIT_OVER else [text])
        out = " ".join(_mt(s, lang) for s in chunks)
        if lang in ADR_LANGS and ADR_OK:
            out = adr.adr(out)
        out = re.sub(r"\s{2,}", " ", out).strip()

        why = _suspect(text, out)
        if why:
            _stats["rejected"] += 1
            log.warning("rejected (%s): %r -> %r", why, text[:80], out[:80])
            return text, why                        # rejects are NOT cached

        _cache_put(text, lang, out)
    return out, ""


# ---------------------------------------------------------------- self-test
SELF_TESTS = [
    "It is 25.3 degrees Celsius in Lagos with 84% humidity.",
    "My name is Vivid. How can I help you today?",
]
SELFTEST: dict = {}
log.info("running self-test ...")
for _lang in TARGETS:
    results = []
    for _t in SELF_TESTS:
        _out, _why = translate(_t, _lang)
        results.append({"in": _t, "out": _out,
                        "rejected": _why if _why not in ("", "canned", "cached")
                        else None})
    SELFTEST[_lang] = results
    passed = sum(1 for r in results if not r["rejected"])
    log.info("self-test %s: %d/%d passed", _lang, passed, len(results))
    for r in results:
        log.info("  %r -> %r%s", r["in"][:50], r["out"][:70],
                 f"  [{r['rejected']}]" if r["rejected"] else "")
HEALTHY = VOCAB_OK and all(
    not r["rejected"] for rs in SELFTEST.values() for r in rs)
_cache.clear(); _order.clear()
_stats.update({"hits": 0, "misses": 0, "canned": 0, "rejected": 0})
if not HEALTHY:
    log.error("SELF-TEST FAILED — the service will return English for most "
              "input. Check the MADLAD weights before relying on yo/ig.")
log.info("translate-service ready (healthy=%s)", HEALTHY)


@app.get("/health")
def health():
    return {"ok": True, "healthy": HEALTHY, "model": MADLAD,
            "device": str(model.device), "languages": list(TARGETS),
            "vocab": {"tokenizer": len(tok), "embedding_rows": EMB_ROWS,
                      "ok": VOCAB_OK},
            "adr": {"ok": ADR_OK, "langs": sorted(ADR_LANGS)},
            "phrasebook": {k: len(v) for k, v in PHRASEBOOK.items()},
            "stats": dict(_stats, cache_size=len(_cache))}


@app.get("/selftest")
def selftest():
    """What the model produced at boot -- the fastest way to tell a broken
    checkpoint from a broken caller."""
    return {"healthy": HEALTHY, "results": SELFTEST}


@app.post("/translate")
def translate_http(text: str = Form(...), lang: str = Form(...)):
    """Backend contract: `translated` is always speakable text. When
    `fallback` is true it is the original English (send it to the en TTS
    path, not the yo/ig one); `reason` says why."""
    out, why = translate(text, lang)
    fallback = why not in ("", "canned", "cached")
    return {"translated": out, "lang": lang if not fallback else "en",
            "fallback": fallback, "reason": why or None}