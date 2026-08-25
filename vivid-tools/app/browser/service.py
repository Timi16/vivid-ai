"""Browser operations. Deliberately free of FastAPI: the routers translate
HTTP into these calls, so the logic stays testable without a server."""
from ..security import host_allowed
from .pool import pool
from .snapshot import SNAPSHOT_JS, format_snapshot


class DomainNotAllowed(RuntimeError):
    """Navigation outside the session's allowlist.

    An authenticated session carries live cookies, and the controller chooses
    where to go from page text an attacker can write. The backend checks this
    too; this is the second lock on the same door, in the process that
    actually holds the cookies.
    """


async def open_session(sid: str, storage_state: dict | None = None,
                       allowed_domains: list | None = None) -> dict:
    s = await pool.open(sid, storage_state=storage_state,
                        allowed_domains=allowed_domains)
    return {"session": sid, "authenticated": s.authenticated,
            "allowed_domains": s.allowed_domains}


async def navigate(sid: str, url: str) -> dict:
    s = await pool.ensure(sid)
    if not host_allowed(s.allowed_domains, url):
        raise DomainNotAllowed(
            f"this session may only reach {', '.join(s.allowed_domains)}")
    await s.page.goto(url, wait_until="domcontentloaded")
    # A new page renumbers everything, and any secret field belonged to the
    # old one.
    s.refs = []
    s.secret_refs = set()
    return {"url": s.page.url, "title": await s.page.title()}


async def snapshot(sid: str) -> dict:
    s = await pool.session(sid)
    raw = await s.page.evaluate(SNAPSHOT_JS, sorted(s.secret_refs))
    text, elements = format_snapshot(raw)
    # Refs are positional and regenerated every snapshot: a stale ref from two
    # navigations ago must never resolve to whatever now sits at that index.
    s.refs = elements
    # Carry secret marks forward by label, since indices shift between
    # snapshots but the field itself persists across a re-render.
    secret_labels = {e["label"] for e in elements if e.get("secret")}
    s.secret_refs = {i for i, e in enumerate(elements)
                     if e["label"] in secret_labels}
    return {"snapshot": text, "count": len(elements), "url": raw.get("url"),
            "title": raw.get("title") or "", "headings": raw.get("headings") or [],
            "text": (raw.get("text") or "")[:4000], "elements": elements}


async def read_text(sid: str, selector: str = "body") -> dict:
    s = await pool.session(sid)
    body = await s.page.inner_text(selector)
    return {"text": " ".join(body.split()), "url": s.page.url}


async def act(sid: str, ref: int, action: str, value: str = "",
              secret: bool = False) -> dict:
    s = await pool.session(sid)
    if ref < 0 or ref >= len(s.refs):
        raise ValueError(f"no element [{ref}]; take a fresh snapshot")
    element = s.refs[ref]
    label = element["label"]
    selector = element.get("selector")
    # Prefer the CSS path: the visible label is not unique (two "Read more"
    # links resolve to the same first match) and for fields it now describes
    # state rather than quoting content, so it is not page text at all.
    locator = (s.page.locator(selector).first if selector
               else s.page.get_by_text(label, exact=False).first)
    if action == "click":
        await locator.click()
    elif action == "type":
        await locator.fill(value)
    elif action == "submit":
        await locator.fill(value)
        await s.page.keyboard.press("Enter")
    else:
        raise ValueError(f"unknown action '{action}'")
    await s.page.wait_for_load_state("domcontentloaded")

    if secret or element.get("secret"):
        # Remember that this field holds a credential so every later snapshot
        # keeps describing it rather than reading it back.
        s.secret_refs.add(ref)

    # NEVER include `value` here: for a secret field that is the credential,
    # and this string is returned to the caller and fed to the controller.
    return {"did": f"{action} on '{label}'", "url": s.page.url}


async def storage_state(sid: str) -> dict:
    """Cookies and local storage, for replaying this session later."""
    s = await pool.session(sid)
    return {"storage_state": await s.context.storage_state()}
