"""Yoruba diacritic restoration, number-safe.

MADLAD translates faithfully but strips tone marks; Davlan/mT5_base_yoruba_adr
puts them back. It is a seq2seq model though, so digits are just tokens it can
resample -- it rewrote "84%" as "79,". Numeric spans are therefore split out
before the model sees them and rejoined afterwards, byte-identical.

Known limitation: ADR disambiguates homographs from context and can pick wrong
("ojo 15" -> "òjò 15", rain, instead of "ọjọ́ 15", day). Lower risk than an MT
hallucination, but not zero -- worth sampling in review.
"""
import re

import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

MODEL = "Davlan/mT5_base_yoruba_adr"

# Anything numeric-ish: 25.3, 84%, 135,864, 27.2°C, 15, 2026
_NUM = re.compile(r"\d[\d.,:%°/-]*\s*(?:°?[CF]\b|%)?")

_tok = _mdl = None


def load(device: str = "cuda", int8: bool = False) -> None:
    """Load once at startup. Safe to call twice."""
    global _tok, _mdl
    if _mdl is not None:
        return
    _tok = AutoTokenizer.from_pretrained(MODEL)
    kw = {"load_in_8bit": True, "device_map": "auto"} if int8 else {}
    try:
        _mdl = AutoModelForSeq2SeqLM.from_pretrained(MODEL, dtype=torch.bfloat16, **kw)
    except TypeError:                          # transformers 4.x
        _mdl = AutoModelForSeq2SeqLM.from_pretrained(MODEL, torch_dtype=torch.bfloat16, **kw)
    if not int8:
        _mdl = _mdl.to(device)
    _mdl.eval()
    print(f"ADR ready: {MODEL} on {_mdl.device}")


def ready() -> bool:
    return _mdl is not None


def _restore(chunk: str) -> str:
    chunk = chunk.strip()
    if not chunk:
        return ""
    ids = _tok(chunk, return_tensors="pt").input_ids.to(_mdl.device)
    with torch.no_grad():
        out = _mdl.generate(ids, max_new_tokens=200, num_beams=4,
                            no_repeat_ngram_size=4)
    return _tok.decode(out[0], skip_special_tokens=True).strip()


def adr(text: str) -> str:
    """Diacritise Yoruba, leaving every numeric span untouched."""
    if _mdl is None or not text or not text.strip():
        return text

    parts, last = [], 0
    for m in _NUM.finditer(text):
        parts.append(("t", text[last:m.start()]))
        parts.append(("n", m.group(0)))
        last = m.end()
    parts.append(("t", text[last:]))

    out = []
    for kind, chunk in parts:
        if kind == "n":
            out.append(chunk)
        elif chunk.strip():
            out.append(_restore(chunk))

    joined = re.sub(r"\s{2,}", " ", " ".join(x for x in out if x))
    return re.sub(r"\s+([,.!?;:%])", r"\1", joined).strip()


if __name__ == "__main__":
    load()
    for t in ["Orukọ mi ni Vivid. Bii mo ṣe le ṣe iranlọwọ fun ọ lojoojumọ?",
              "O jẹ 25.3 degrees Celsius ni Lagos, pẹlu 84% ti afẹfẹ.",
              "100 US dollars jẹ nipa 135,864 naira."]:
        r = adr(t)
        ok = _NUM.findall(t) == _NUM.findall(r)
        print("IN :", t)
        print("OUT:", r)
        print("NUM:", "OK" if ok else "CHANGED", "\n")
