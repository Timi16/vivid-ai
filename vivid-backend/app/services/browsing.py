"""The managed browsing loop: snapshot -> the LLM picks one action -> execute
-> repeat, until it can answer or runs out of steps.

This used to live inside `tools.py:tool_browse`, reachable only when the chat
planner happened to elect it. It is lifted out here so the chat tool and the
partner `/v1/browser/tasks` endpoint run the *same* controller — if they
forked, they would drift, and the chat product is the one that would quietly
get worse.

The loop talks to a `Driver`, not to the browser service, because the two
callers need different rules around the same actions: a partner session
enforces per-session allowed domains and tracks snapshot identity, while the
chat tool reuses a session keyed to the chat.
"""
import asyncio
import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator, Awaitable, Callable, Protocol

from app.core.config import settings
from app.core.errors import APIError
from app.services import browser_sessions, vivid_tools
from app.services.models_gateway import llm

log = logging.getLogger("vivid.browsing")

#: A chat turn cannot wait on twenty page loads, so the tool keeps the tighter
#: budget it always had. Partner tasks choose their own up to the config max.
CHAT_MAX_STEPS = 6

_JSON = re.compile(r"\{.*\}", re.DOTALL)

CONTROLLER_PROMPT = """You are operating a web browser to accomplish this goal:
GOAL: {goal}

Below is a snapshot of the current page: title, headings, text, and numbered
interactive ELEMENTS. Decide the single next action. Reply with ONLY one JSON
object, no prose:
  {{"action": "click", "ref": <n>}}                     click element [n]
  {{"action": "type", "ref": <n>, "value": "<text>"}}   fill a field
  {{"action": "submit", "ref": <n>, "value": "<text>"}} fill and press Enter (search boxes)
  {{"action": "goto", "url": "https://..."}}            open a different page
  {{"action": "done", "answer": "<what you found>"}}    finish — answer the goal from what the pages showed

You have {remaining} actions left. If the current page already contains what
the goal needs, reply done with a specific, factual answer. The answer must
quote only what a snapshot actually showed — include the page title and site
domain you got it from (e.g. "according to iana.org…"). Never invent content
that is not in a snapshot.{scope}
Result of your previous action: {last_result}"""


@dataclass
class Step:
    index: int
    action: str
    url: str = ""
    label: str = ""
    ref: int | None = None
    ok: bool = True
    error: str | None = None
    answer: str | None = None

    def as_event(self) -> dict:
        return {"index": self.index, "action": self.action, "url": self.url,
                "label": self.label, "ref": self.ref, "ok": self.ok,
                "error": self.error, "answer": self.answer}


@dataclass
class Outcome:
    answer: str = ""
    url: str = ""
    session_id: str = ""
    truncated: bool = False
    steps: list[Step] = field(default_factory=list)

    def as_event(self) -> dict:
        return {"answer": self.answer, "url": self.url,
                "session_id": self.session_id, "truncated": self.truncated,
                "steps": [s.as_event() for s in self.steps]}


class Driver(Protocol):
    """What the loop needs from a browser session."""

    session_id: str

    async def goto(self, url: str) -> dict: ...
    async def snapshot(self) -> dict: ...
    async def act(self, ref: int, action: str, value: str) -> dict: ...


class RawDriver:
    """Straight to vivid-tools against a fixed session id — the chat tool.

    `allowed_domains` is optional here and normally empty: a chat user asking
    the assistant to browse has not scoped anything. Nothing authenticated is
    reachable this way, so there are no cookies to steal.
    """

    def __init__(self, session_id: str, allowed_domains: list[str] | None = None):
        self.session_id = session_id
        self.allowed_domains = allowed_domains or []

    def _check(self, url: str) -> None:
        if not self.allowed_domains:
            return
        browser_sessions.assert_url_allowed(
            browser_sessions.SessionRecord(
                id=self.session_id, owner_id="", user_id="",
                allowed_domains=self.allowed_domains), url)

    async def goto(self, url: str) -> dict:
        self._check(url)
        return await vivid_tools.call("/browse/goto",
                                      {"url": url, "session": self.session_id})

    async def snapshot(self) -> dict:
        return await vivid_tools.call("/browse/snapshot",
                                      {"session": self.session_id}, 30)

    async def act(self, ref: int, action: str, value: str) -> dict:
        return await vivid_tools.call("/browse/act", {
            "session": self.session_id, "ref": ref, "action": action,
            "value": value})

    async def close(self) -> None:
        try:
            await vivid_tools.call("/browse/close",
                                   {"session": self.session_id}, 10)
        except Exception:
            pass


class SessionDriver:
    """A registry-backed partner session: ownership already checked, egress
    restricted to the session's domains, snapshot identity tracked.

    Snapshot identity is the server half of the stale-ref guard. Element refs
    are positional and renumbered on every snapshot, so acting on one taken
    before a navigation hits whatever now sits at that index — which is how an
    agent clicks the wrong thing and reports success. The SDK checks this too;
    the server checks because a partner may not be using the SDK.
    """

    def __init__(self, redis, record: browser_sessions.SessionRecord) -> None:
        self._redis = redis
        self.record = record

    @property
    def session_id(self) -> str:
        return self.record.id

    async def goto(self, url: str) -> dict:
        browser_sessions.assert_url_allowed(self.record, url)
        data = await vivid_tools.call(
            "/browse/goto", {"url": url, "session": self.record.id})
        # A new page renumbers everything; refs from the old one are void.
        await browser_sessions.set_snapshot(self._redis, self.record, "")
        return data

    async def snapshot(self) -> dict:
        data = await vivid_tools.call(
            "/browse/snapshot", {"session": self.record.id}, 30)
        snapshot_id = f"snap_{uuid.uuid4().hex[:16]}"
        await browser_sessions.set_snapshot(self._redis, self.record, snapshot_id)
        return {**data, "snapshot_id": snapshot_id}

    async def act(self, ref: int, action: str, value: str,
                  secret: bool = False, snapshot_id: str | None = None) -> dict:
        if not self.record.snapshot_id:
            raise APIError(
                409, "stale_ref",
                "the page has changed since the last snapshot; take a fresh "
                "snapshot and find the element again")
        if snapshot_id and snapshot_id != self.record.snapshot_id:
            raise APIError(
                409, "stale_ref",
                "that element came from an earlier snapshot; refs are "
                "positional and change on every snapshot")

        payload = {"session": self.record.id, "ref": ref, "action": action,
                   "value": value}
        if secret:
            # Marks the field so the browser service keeps its value out of
            # every later snapshot — the value itself is never logged here.
            payload["secret"] = True
        data = await vivid_tools.call("/browse/act", payload)
        # Acting changes the page: it may navigate, and even typing alters
        # which elements exist (validation messages, buttons enabling).
        await browser_sessions.set_snapshot(self._redis, self.record, "")
        return data

    async def storage_state(self) -> dict:
        data = await vivid_tools.call(
            "/browse/storage_state", {"session": self.record.id}, 30)
        return data.get("storage_state") or {}


async def _decide(goal: str, snapshot_text: str, remaining: int,
                  last_result: str, allowed_domains: list[str]) -> dict:
    scope = ""
    if allowed_domains:
        # The controller picks navigation from page text an attacker can write.
        # Telling it the boundary saves a wasted step; the driver enforces it
        # regardless, because a prompt is not a security control.
        scope = ("\nYou may only open pages on: "
                 + ", ".join(allowed_domains)
                 + ". A goto anywhere else will be refused.")
    prompt = CONTROLLER_PROMPT.format(goal=goal, remaining=remaining,
                                      last_result=last_result, scope=scope)
    raw = await llm.complete(
        [{"role": "system", "content": prompt},
         {"role": "user", "content": snapshot_text or "(blank page)"}],
        max_tokens=300, temperature=0.0)
    match = _JSON.search(raw)
    return json.loads(match.group(0)) if match else {}


async def run(driver: Driver, *, goal: str, max_steps: int,
              allowed_domains: list[str] | None = None,
              on_status: Callable[[str], Awaitable[None]] | None = None,
              cancelled: Callable[[], bool] | None = None
              ) -> AsyncIterator[Step | Outcome]:
    """Drive the browser toward `goal`, yielding a Step per action and one
    Outcome at the end.

    Never raises for an action that fails: a failed click becomes a Step with
    ok=False and the loop carries on, because the controller can usually
    recover by trying something else. Only a broken browser service or a dead
    LLM ends the run early, and those surface as APIError.
    """
    domains = allowed_domains or []
    steps: list[Step] = []
    last_result = "the session was already open"
    current_url = ""
    index = 0

    async def status(text: str) -> None:
        if on_status is not None:
            await on_status(text)

    for remaining in range(max_steps, 0, -1):
        if cancelled is not None and cancelled():
            break
        snap = await driver.snapshot()
        current_url = snap.get("url") or current_url

        try:
            decision = await _decide(goal, snap.get("snapshot") or "",
                                     remaining, last_result, domains)
        except (llm.LLMUnavailable, json.JSONDecodeError, asyncio.TimeoutError) as e:
            log.warning("browse controller failed: %s", e)
            yield Outcome(answer=(snap.get("snapshot") or "")[:2000],
                          url=current_url, session_id=driver.session_id,
                          truncated=True, steps=steps)
            return

        action = str(decision.get("action") or "").strip()

        if action == "done":
            answer = str(decision.get("answer") or "").strip()
            step = Step(index=index, action="done", url=current_url,
                        answer=answer or None)
            steps.append(step)
            yield step
            yield Outcome(answer=answer or (snap.get("snapshot") or "")[:2000],
                          url=current_url, session_id=driver.session_id,
                          steps=steps)
            return

        if action not in ("goto", "click", "type", "submit"):
            # An unparseable decision means the controller is lost; burning
            # the remaining budget on it helps nobody.
            log.info("browse controller returned no usable action: %r", decision)
            break

        step = Step(index=index, action=action, url=current_url,
                    ref=_as_int(decision.get("ref")))
        try:
            if action == "goto":
                url = str(decision.get("url") or "")
                if not url.startswith(("http://", "https://")):
                    raise ValueError("the controller produced an invalid url")
                await status(f"Opening {url[:50]}…")
                result = await driver.goto(url)
                current_url = result.get("url") or url
                last_result = f"opened {current_url}"
                step.url = current_url
            else:
                verb = {"click": "Clicking", "type": "Typing",
                        "submit": "Searching"}[action]
                await status(f"{verb}…")
                result = await driver.act(step.ref if step.ref is not None else -1,
                                          action, str(decision.get("value") or ""))
                last_result = result.get("did") or action
                step.label = last_result
                current_url = result.get("url") or current_url
                step.url = current_url
        except APIError as e:
            # A refused navigation or a stale ref is information the
            # controller can act on, not the end of the run.
            step.ok, step.error = False, e.message
            last_result = f"error: {e.message}"
        except Exception as e:
            step.ok, step.error = False, f"{type(e).__name__}: {e}"
            last_result = f"error: {step.error}"

        steps.append(step)
        yield step
        index += 1

    snap = {}
    try:
        snap = await driver.snapshot()
    except APIError:
        pass
    yield Outcome(
        answer=(snap.get("snapshot") or "")[:2500],
        url=snap.get("url") or current_url, session_id=driver.session_id,
        truncated=True, steps=steps)


def _as_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


async def run_for_chat(chat_id: str | None, url: str, goal: str,
                       on_status: Callable[[str], Awaitable[None]] | None = None
                       ) -> str:
    """The chat tool's entry point: run the loop and flatten it to the single
    observation string the planner's prompt expects."""
    session_id = f"chat-{chat_id}" if chat_id else f"turn-{uuid.uuid4().hex[:10]}"
    driver = RawDriver(session_id)
    await driver.goto(url)

    outcome: Outcome | None = None
    async for event in run(driver, goal=goal, max_steps=CHAT_MAX_STEPS,
                           on_status=on_status):
        if isinstance(event, Outcome):
            outcome = event
    if outcome is None:
        return "error: the browser produced no result"

    trail = "; ".join(s.label or s.action for s in outcome.steps if s.ok)
    if outcome.truncated:
        return ("Ran out of browsing steps. Actions taken: "
                + (trail or "none") + "\nFinal page:\n" + outcome.answer)[:3500]
    return outcome.answer + (f" (steps: {trail})" if trail else "")


def max_steps_for(requested: int | None) -> int:
    steps = requested or settings.BROWSER_TASK_DEFAULT_STEPS
    if steps < 1 or steps > settings.BROWSER_TASK_MAX_STEPS:
        raise APIError(422, "invalid_request",
                       f"max_steps must be between 1 and "
                       f"{settings.BROWSER_TASK_MAX_STEPS}")
    return steps
