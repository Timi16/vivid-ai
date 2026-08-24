"""Turns a rendered page into a numbered text view.

Not pixels (the LLM has vision disabled) and not raw HTML (50k tokens of divs).
A numbered list of interactive elements gives the model a safe vocabulary for
acting -- "click 7" instead of a CSS selector it invented.
"""
from ..config import settings

SNAPSHOT_JS = """() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 &&
           s.visibility !== 'hidden' && s.display !== 'none';
  };
  const selector = 'a,button,input,textarea,select,[role=button],[role=link],[onclick]';
  const elements = [];
  document.querySelectorAll(selector).forEach((el) => {
    if (!visible(el)) return;
    const label = (el.innerText || el.value || el.placeholder ||
                   el.getAttribute('aria-label') || el.name || '').trim();
    if (!label) return;
    elements.push({ tag: el.tagName.toLowerCase(), type: el.type || '',
                    label: label.slice(0, 80) });
  });
  const headings = [...document.querySelectorAll('h1,h2,h3')]
    .filter(visible).map((h) => h.innerText.trim()).filter(Boolean).slice(0, 12);
  return { title: document.title, url: location.href, headings, elements,
           text: document.body.innerText.replace(/\\s+/g, ' ') };
}"""


def format_snapshot(raw: dict) -> tuple[str, list]:
    cfg = settings()
    elements = raw.get("elements", [])[: cfg.max_elements]
    lines = [f"PAGE: {raw.get('title','')} ({raw.get('url','')})"]
    if raw.get("headings"):
        lines.append("HEADINGS: " + " | ".join(raw["headings"]))
    lines.append("CONTENT: " + raw.get("text", "")[: cfg.max_text_chars])
    if elements:
        lines.append("ELEMENTS:")
        for i, el in enumerate(elements):
            kind = el["tag"] + (f"/{el['type']}" if el.get("type") else "")
            lines.append(f"  [{i}] {kind}: {el['label']}")
    return "\n".join(lines), elements
