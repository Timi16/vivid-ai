"""Websites the model builds in chat.

The contract with the model (see prompt.py, WEBSITES) is one self-contained
HTML document in a single ```html fence. This module finds that document in a
finished reply so the pipeline can store it as a file: it then has a URL,
shows up on the Artifacts page, and the apps do not have to re-parse the
reply to render the card.
"""
import re
import unicodedata

_FENCE = re.compile(
    r"```(?P<lang>html|htm)?[^\n]*\n(?P<body>.*?)\n```", re.IGNORECASE | re.DOTALL)
_TITLE = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_DOC_START = re.compile(r"^\s*(<!doctype\s+html|<html)", re.IGNORECASE)

DEFAULT_TITLE = "Website"


def extract_document(reply: str) -> tuple[str, str, str] | None:
    """Return (html, title, filename) for the first complete HTML document in
    the reply, or None. A fence counts when it is tagged html, or when its
    body starts like a document, which covers a model that forgot the tag."""
    for m in _FENCE.finditer(reply):
        body = m.group("body")
        lang = (m.group("lang") or "").lower()
        if lang or _DOC_START.match(body):
            title = _title_of(body)
            return body, title, f"{slugify(title)}.html"
    return None


def _title_of(html: str) -> str:
    m = _TITLE.search(html)
    if not m:
        return DEFAULT_TITLE
    title = re.sub(r"\s+", " ", m.group(1)).strip()
    return title[:120] or DEFAULT_TITLE


def slugify(title: str) -> str:
    # Strip accents rather than dropping the letter: "Café" -> "cafe".
    plain = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")
    return slug[:60] or "website"
