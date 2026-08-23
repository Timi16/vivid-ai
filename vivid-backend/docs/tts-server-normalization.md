# Moving speech normalization into the TTS server

Decision (Timmy, Aug 2026): `clean_for_tts` belongs in the TTS server — the
last stop before audio — not in each caller. Any future caller (a B2B client,
a test script, another Vivid surface) that bypasses the backend gets correct
digit reading for free, and the wav cache keys on normalized text so
"₦135,000" and its spelled form share one cache entry.

Until this patch is applied on the pod, the backend normalizes before calling
TTS (`TTS_CLEAN_IN_BACKEND=true`, the default).

## Patch for the TTS server (port 8003)

1. `pip install num2words` in the wazobia venv.

2. Add to the top of the server file (this is the backend's
   `app/services/tts_text.py`, same code):

```python
import re

_MD = re.compile(r"(\*+|_+|#+|`+|>|^\s*[-•]\s*)", re.MULTILINE)
_CURRENCY = {"$": "US dollars", "₦": "naira", "£": "pounds", "€": "euros"}
_CUR_RE = re.compile(r"([$₦£€])\s?(\d[\d,]*(?:\.\d+)?)")
_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _spell(m):
    raw = m.group(0).replace(",", "")
    try:
        from num2words import num2words
        if "." in raw:
            whole, frac = raw.split(".", 1)
            return (num2words(int(whole)) + " point "
                    + " ".join(num2words(int(d)) for d in frac))
        return num2words(int(raw))
    except Exception:
        return raw


def clean_for_tts(text: str) -> str:
    text = _CUR_RE.sub(lambda m: f"{m.group(2)} {_CURRENCY[m.group(1)]}", text)
    text = text.replace("%", " percent").replace("°C", " degrees Celsius")
    text = _NUM_RE.sub(_spell, text)
    return re.sub(r"\s+", " ", _MD.sub(" ", text)).strip()
```

3. In `/speak`, normalize BEFORE the cache key is computed:

```python
@app.post("/speak")
def speak(text: str = Form(...), lang: str = Form("en"), voice: str = Form(None)):
    ...
    text = clean_for_tts(text.strip())   # <— add this line
    if not text:
        return Response(content=b"", media_type="audio/wav")
    key = _cache_key(text, f"{lang}:{voice or ''}")
    ...
```

4. Flip the backend: set `TTS_CLEAN_IN_BACKEND=false` in its environment (or
   config) and restart. Nothing else changes — the pipeline already hands the
   TTS adapter post-translation text with digits intact, so the
   translate → normalize → synthesize ordering holds in both configurations.
