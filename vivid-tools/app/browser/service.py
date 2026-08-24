"""Browser operations. Deliberately free of FastAPI: the routers translate
HTTP into these calls, so the logic stays testable without a server."""
from .pool import pool
from .snapshot import SNAPSHOT_JS, format_snapshot


async def navigate(sid: str, url: str) -> dict:
    s = await pool.session(sid)
    await s.page.goto(url, wait_until="domcontentloaded")
    return {"url": s.page.url, "title": await s.page.title()}


async def snapshot(sid: str) -> dict:
    s = await pool.session(sid)
    raw = await s.page.evaluate(SNAPSHOT_JS)
    text, elements = format_snapshot(raw)
    # Refs are positional and regenerated every snapshot: a stale ref from two
    # navigations ago must never resolve to whatever now sits at that index.
    s.refs = elements
    return {"snapshot": text, "count": len(elements), "url": raw.get("url")}


async def read_text(sid: str, selector: str = "body") -> dict:
    s = await pool.session(sid)
    body = await s.page.inner_text(selector)
    return {"text": " ".join(body.split()), "url": s.page.url}


async def act(sid: str, ref: int, action: str, value: str = "") -> dict:
    s = await pool.session(sid)
    if ref < 0 or ref >= len(s.refs):
        raise ValueError(f"no element [{ref}]; take a fresh snapshot")
    label = s.refs[ref]["label"]
    locator = s.page.get_by_text(label, exact=False).first
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
    return {"did": f"{action} on '{label}'", "url": s.page.url}
