"""Turns a rendered page into a numbered text view.

Not pixels (the LLM has vision disabled) and not raw HTML (50k tokens of divs).
A numbered list of interactive elements gives the model a safe vocabulary for
acting -- "click 7" instead of a CSS selector it invented.

SECURITY: an element's label must never be its VALUE. It used to be --
`el.innerText || el.value || ...` -- and `innerText` is empty for <input>, so
the value won any time a field was filled. Once a login form had been filled
that rendered as `[4] input/password: hunter2`, which then travelled into the
snapshot text, the controller's next prompt, and the logs. Nothing typed
credentials back then, so it never fired; authenticated browsing is exactly
the feature that would have turned it into credential disclosure.

Fields are now described, never quoted: `[4] input/password: (empty)` or
`(filled)`. That is all a controller needs to decide what to do next.
"""
from ..config import settings

SNAPSHOT_JS = """(secretRefs) => {
  // A stable-ish CSS path per element, so acting on one does not depend on
  // matching its visible text. Text matching was already fragile -- two
  // "Read more" links both resolved to the first -- and describing fields by
  // state rather than value broke it outright, since the rendered label no
  // longer equals the text on the page.
  const cssPath = (el) => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      if (node.id && /^[A-Za-z][\\w-]*$/.test(node.id)) {
        parts.unshift('#' + node.id);
        return parts.join(' > ');
      }
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const kin = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (kin.length > 1) part += ':nth-of-type(' + (kin.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 &&
           s.visibility !== 'hidden' && s.display !== 'none';
  };
  const SECRET_TYPES = new Set(['password']);
  const SECRET_AUTOCOMPLETE = /password|cc-number|cc-csc|one-time-code/i;

  // A field is secret if the page says so (type=password, an autocomplete
  // hint, a name that looks like a credential) or if the caller told us it
  // filled that field with a secret. Both matter: the first covers ordinary
  // login forms, the second covers a site that hides its password field
  // behind a custom widget.
  const isSecretField = (el, index) => {
    if (secretRefs && secretRefs.indexOf(index) !== -1) return true;
    const type = (el.type || '').toLowerCase();
    if (SECRET_TYPES.has(type)) return true;
    const hints = [el.getAttribute('autocomplete'), el.name, el.id]
      .filter(Boolean).join(' ');
    return SECRET_AUTOCOMPLETE.test(hints);
  };

  const selector = 'a,button,input,textarea,select,[role=button],[role=link],[onclick]';
  const elements = [];
  document.querySelectorAll(selector).forEach((el) => {
    if (!visible(el)) return;
    const tag = el.tagName.toLowerCase();
    const isField = tag === 'input' || tag === 'textarea' || tag === 'select';
    const index = elements.length;

    // Never el.value: for a filled field that IS the user's data, and for a
    // password field it is the password.
    let label = (el.innerText || el.placeholder ||
                 el.getAttribute('aria-label') || el.getAttribute('title') ||
                 el.name || '').trim();

    if (isField) {
      const secret = isSecretField(el, index);
      const filled = typeof el.value === 'string' && el.value.length > 0;
      // Describe the state so the controller can tell "already typed" from
      // "still blank" without ever seeing the contents.
      const state = secret ? (filled ? '(secret, filled)' : '(secret, empty)')
                           : (filled ? '(filled)' : '(empty)');
      label = label ? `${label} ${state}` : state;
      if (secret) el.setAttribute('data-vivid-secret', '1');
    }

    // A field with no describable label at all is still actionable -- a bare
    // password box often has neither placeholder nor aria-label -- so fields
    // are kept on their state alone. Non-fields still need text to be worth
    // offering.
    if (!label) return;
    elements.push({ tag: tag, type: el.type || '',
                    label: label.slice(0, 80),
                    selector: cssPath(el),
                    secret: isField && isSecretField(el, index) });
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
