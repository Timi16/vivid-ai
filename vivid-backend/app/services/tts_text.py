"""Text-to-speech preparation, moved off the pod (it is presentation logic,
not GPU work). Ported from the 8002 service's clean_for_tts:

- Gemma emits markdown (**bold**, bullets) even when told not to; asterisks
  and hashes get read aloud or confuse the tokenizer — strip before TTS.
- TTS reads raw digits badly — "143" came out as "14" and "₦118,000" as
  noise. Numbers are spelled out at the synthesis boundary ONLY: they must
  stay as digits for the LLM and for MADLAD, which copies them verbatim.
"""
import re

_MD = re.compile(r"(\*+|_+|#+|`+|>|^\s*[-•]\s*)", re.MULTILINE)

_CURRENCY = {"$": "US dollars", "₦": "naira", "£": "pounds", "€": "euros"}
_CUR_RE = re.compile(r"([$₦£€])\s?(\d[\d,]*(?:\.\d+)?)")
_NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _spell(m: "re.Match") -> str:
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


def speakable(text: str) -> str:
    text = _CUR_RE.sub(lambda m: f"{m.group(2)} {_CURRENCY[m.group(1)]}", text)
    text = text.replace("%", " percent").replace("°C", " degrees Celsius")
    return _NUM_RE.sub(_spell, text)


def clean_for_tts(text: str) -> str:
    return speakable(re.sub(r"\s+", " ", _MD.sub(" ", text)).strip())
