"""Browsing: the surface this SDK exists for.

Two layers, because the two real use cases want different things:

  layer 1  you drive — goto / snapshot / click / type, so you write your own
           agent loop and keep every decision
  layer 2  Vivid drives — give it a goal and a starting URL, get back an
           answer plus the trail of actions that produced it

Both run on the same server-side session, so a task can continue inside a
session you authenticated yourself. That combination is the point: log in with
layer 1, then hand the authenticated session to layer 2.
"""
from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator, Iterator, Sequence
from typing import Any

from .._transport import BROWSE_TIMEOUT, AsyncTransport, Transport
from ..errors import StaleRef, TaskFailed, VividError
from ..secret import Secret, is_secret, reveal
from ..types import (
    ActResult,
    BrowserSessionInfo,
    Element,
    NavResult,
    Snapshot,
    TaskResult,
    TaskStep,
)

#: The server caps this too; refusing locally just fails faster and cheaper.
MAX_STEPS_LIMIT = 30


def _session_payload(storage_state: dict | None,
                     allowed_domains: Sequence[str] | None,
                     idle_ttl: int | None) -> dict:
    """Shared request body + the one client-side rule worth enforcing early.

    An authenticated session carries live cookies. Letting it navigate
    anywhere means any page it lands on can steer the controller into
    exfiltrating them, so `allowed_domains` is required whenever storage state
    is supplied. The server enforces this as well — this check exists to fail
    at the call site, where the fix is obvious, rather than in a stack trace.
    """
    if storage_state is not None and not allowed_domains:
        raise ValueError(
            "allowed_domains is required for an authenticated session: a "
            "session holding live cookies must not be able to navigate "
            "off-domain. Pass the hosts this session should reach, e.g. "
            'allowed_domains=["example.com"].')
    body: dict[str, Any] = {}
    if storage_state is not None:
        body["storage_state"] = storage_state
    if allowed_domains:
        body["allowed_domains"] = list(allowed_domains)
    if idle_ttl is not None:
        body["idle_ttl"] = int(idle_ttl)
    return body


def _act_payload(session_last_snapshot: str | None, target: Element | int,
                 action: str, value: str | Secret = "") -> dict:
    """Build an /act body, refusing refs that a newer snapshot invalidated.

    Refs are positional and regenerate on every snapshot, so a ref held across
    one is not merely stale — it points at whatever now occupies that index,
    which is how an agent ends up clicking the wrong thing and reporting
    success. Catching it here turns a silent misfire into a clear error.
    """
    if isinstance(target, Element):
        if target.snapshot_id:
            if session_last_snapshot is None:
                # Navigating or acting clears the current snapshot, because
                # both change the page. Any ref still held is therefore stale —
                # and this is the case that matters most, since the page under
                # it has demonstrably moved.
                raise StaleRef(
                    f"element [{target.ref}] {target.label!r} is stale: the "
                    "page changed since that snapshot was taken. Call "
                    "snapshot() again and find the element on the new page.")
            if target.snapshot_id != session_last_snapshot:
                raise StaleRef(
                    f"element [{target.ref}] {target.label!r} came from an "
                    "earlier snapshot; refs are positional and change on every "
                    "snapshot. Take a fresh snapshot() and find it again.")
        ref, snapshot_id = target.ref, target.snapshot_id
    else:
        # A bare int is accepted for parity with the HTTP API, but it carries
        # no snapshot identity, so the server does the checking.
        ref, snapshot_id = int(target), session_last_snapshot or ""

    body: dict[str, Any] = {"ref": ref, "action": action}
    if snapshot_id:
        body["snapshot_id"] = snapshot_id
    if value != "" or action in ("type", "submit"):
        body["value"] = reveal(value)
        if is_secret(value):
            # Tells the service to mark the field so its value never re-enters
            # a snapshot, a controller prompt, or a log line.
            body["secret"] = True
    return body


class BrowserSession:
    """One live browser context. Use it as a context manager.

    Contexts cost ~200MB each and count against your key's quota, so leaking
    one is expensive in a way an HTTP client normally is not. Exiting the
    block closes it server-side even if the body raised.
    """

    def __init__(self, transport: Transport, info: BrowserSessionInfo) -> None:
        self._t = transport
        self._info = info
        self._closed = False
        #: The snapshot refs currently point into. See _act_payload.
        self._last_snapshot: str | None = None

    # --- identity ---------------------------------------------------------
    @property
    def id(self) -> str:
        return self._info.id

    @property
    def info(self) -> BrowserSessionInfo:
        return self._info

    @property
    def closed(self) -> bool:
        return self._closed

    def __repr__(self) -> str:
        state = "closed" if self._closed else "open"
        return f"<BrowserSession {self._info.id} {state}>"

    def _path(self, suffix: str = "") -> str:
        return f"/browser/sessions/{self._info.id}{suffix}"

    def _check_open(self) -> None:
        if self._closed:
            raise VividError(
                f"session {self._info.id} is closed; open a new one with "
                "client.browser.session()")

    # --- navigation and reading ------------------------------------------
    def goto(self, url: str) -> NavResult:
        """Navigate. Refused if the URL is outside `allowed_domains`, or if the
        SSRF guard rejects it as private/loopback/metadata."""
        self._check_open()
        data = self._t.request("POST", self._path("/goto"),
                               json_body={"url": url}, timeout=BROWSE_TIMEOUT)
        # Navigating invalidates every ref from the previous page.
        self._last_snapshot = None
        return NavResult.from_dict(data or {})

    def snapshot(self) -> Snapshot:
        """The page as the agent sees it: title, headings, text, and numbered
        interactive elements. Taking one invalidates refs from the last."""
        self._check_open()
        data = self._t.request("POST", self._path("/snapshot"), json_body={},
                               timeout=BROWSE_TIMEOUT)
        snap = Snapshot.from_dict(data or {})
        self._last_snapshot = snap.snapshot_id
        return snap

    def text(self, selector: str = "body") -> str:
        """Readable text under `selector`. Cheaper than a snapshot when you
        only want to read, and not capped to the snapshot's 2000 chars."""
        self._check_open()
        data = self._t.request("POST", self._path("/text"),
                               json_body={"selector": selector},
                               timeout=BROWSE_TIMEOUT)
        return (data or {}).get("text", "")

    # --- acting -----------------------------------------------------------
    def click(self, target: Element | int) -> ActResult:
        self._check_open()
        body = _act_payload(self._last_snapshot, target, "click")
        data = self._t.request("POST", self._path("/act"), json_body=body,
                               timeout=BROWSE_TIMEOUT)
        self._last_snapshot = None       # the click may have navigated
        return ActResult.from_dict(data or {})

    def type(self, target: Element | int, value: str | Secret) -> ActResult:
        """Fill a field. Wrap credentials in `secret(...)` — the value then
        never enters a snapshot, a controller prompt, or a log line."""
        self._check_open()
        body = _act_payload(self._last_snapshot, target, "type", value)
        data = self._t.request("POST", self._path("/act"), json_body=body,
                               timeout=BROWSE_TIMEOUT)
        # Typing does not navigate, but it does change the page's elements
        # (validation messages, enabled buttons), so refs are re-taken anyway.
        self._last_snapshot = None
        return ActResult.from_dict(data or {})

    def submit(self, target: Element | int,
               value: str | Secret = "") -> ActResult:
        """Fill a field and press Enter — the search-box case."""
        self._check_open()
        body = _act_payload(self._last_snapshot, target, "submit", value)
        data = self._t.request("POST", self._path("/act"), json_body=body,
                               timeout=BROWSE_TIMEOUT)
        self._last_snapshot = None
        return ActResult.from_dict(data or {})

    # --- authentication ---------------------------------------------------
    def storage_state(self) -> dict:
        """Cookies and local storage, to persist and replay into a later
        session. Treat the result as a bearer credential: it is one."""
        self._check_open()
        data = self._t.request("GET", self._path("/storage_state"))
        return (data or {}).get("storage_state") or {}

    # --- lifecycle --------------------------------------------------------
    def close(self) -> None:
        """Idempotent: closing twice is not an error, and neither is closing
        one the server already reaped."""
        if self._closed:
            return
        self._closed = True
        # A session that is already gone is the state we wanted.
        with contextlib.suppress(VividError):
            self._t.request("DELETE", self._path())

    def __enter__(self) -> BrowserSession:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


class BrowsingTask:
    """A managed browsing run: iterate for steps, then read the result.

        task = client.browser.run(goal="...", url="...")
        for step in task:
            print(step)
        answer = task.result().answer

    Calling result() without iterating drains the stream first, so the simple
    case stays one line.
    """

    def __init__(self, transport: Transport, payload: dict) -> None:
        self._t = transport
        self._payload = payload
        self._steps: list[TaskStep] = []
        self._result: TaskResult | None = None
        self._stream: Iterator[tuple[str, Any]] | None = None
        self._done = False

    @property
    def steps(self) -> list[TaskStep]:
        """Steps seen so far. Complete only once the task has finished."""
        return list(self._steps)

    def _open(self) -> Iterator[tuple[str, Any]]:
        if self._stream is None:
            self._stream = self._t.stream_sse(
                "POST", "/browser/tasks", json_body={**self._payload,
                                                     "stream": True})
        return self._stream

    def __iter__(self) -> Iterator[TaskStep]:
        if self._done:
            yield from self._steps
            return
        for event, data in self._open():
            if event == "step":
                step = TaskStep.from_dict(data, len(self._steps))
                self._steps.append(step)
                yield step
            elif event == "result":
                self._result = TaskResult.from_dict(data)
            elif event == "error":
                self._done = True
                raise TaskFailed((data or {}).get("message")
                                 or "the browsing task failed")
        self._done = True

    def result(self) -> TaskResult:
        """Block until the task finishes and return its answer plus trail."""
        for _ in self:
            pass
        if self._result is None:
            raise TaskFailed("the task ended without producing a result")
        return self._result


class Browser:
    """`client.browser` — sessions and managed tasks."""

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def session(self, *, storage_state: dict | None = None,
                allowed_domains: Sequence[str] | None = None,
                idle_ttl: int | None = None) -> BrowserSession:
        """Open a browser session.

        Pass `storage_state` from a previous session's `storage_state()` to
        resume an authenticated one — no credential ever reaches Vivid that
        way. `allowed_domains` is required whenever you do, and restricts
        every navigation in the session, including ones a managed task
        chooses.
        """
        body = _session_payload(storage_state, allowed_domains, idle_ttl)
        data = self._t.request("POST", "/browser/sessions", json_body=body,
                               timeout=BROWSE_TIMEOUT)
        return BrowserSession(self._t, BrowserSessionInfo.from_dict(data or {}))

    def sessions(self) -> list[BrowserSessionInfo]:
        """Every open session belonging to this API key."""
        data = self._t.request("GET", "/browser/sessions")
        return [BrowserSessionInfo.from_dict(s) for s in (data or [])]

    def close(self, session_id: str) -> None:
        """Close a session by id — for cleaning up one you did not keep."""
        self._t.request("DELETE", f"/browser/sessions/{session_id}")

    def run(self, *, goal: str, url: str | None = None, max_steps: int = 8,
            session: BrowserSession | str | None = None,
            allowed_domains: Sequence[str] | None = None) -> BrowsingTask:
        """Let Vivid drive: snapshot, decide, act, repeat, until it can answer.

        Pass `session` to run inside one you already authenticated. Without it
        a throwaway session is created and closed for you.
        """
        if not goal or not goal.strip():
            raise ValueError("goal is required")
        if session is None and not url:
            raise ValueError("url is required when no session is given")
        if not 1 <= max_steps <= MAX_STEPS_LIMIT:
            raise ValueError(f"max_steps must be 1..{MAX_STEPS_LIMIT}")

        payload: dict[str, Any] = {"goal": goal.strip(),
                                   "max_steps": int(max_steps)}
        if url:
            payload["url"] = url
        if session is not None:
            payload["session_id"] = (session.id
                                     if isinstance(session, BrowserSession)
                                     else session)
        if allowed_domains:
            payload["allowed_domains"] = list(allowed_domains)
        return BrowsingTask(self._t, payload)


# ============================================================ async mirror
class AsyncBrowserSession:
    """Async twin of BrowserSession. `async with` closes it."""

    def __init__(self, transport: AsyncTransport,
                 info: BrowserSessionInfo) -> None:
        self._t = transport
        self._info = info
        self._closed = False
        self._last_snapshot: str | None = None

    @property
    def id(self) -> str:
        return self._info.id

    @property
    def info(self) -> BrowserSessionInfo:
        return self._info

    @property
    def closed(self) -> bool:
        return self._closed

    def __repr__(self) -> str:
        state = "closed" if self._closed else "open"
        return f"<AsyncBrowserSession {self._info.id} {state}>"

    def _path(self, suffix: str = "") -> str:
        return f"/browser/sessions/{self._info.id}{suffix}"

    def _check_open(self) -> None:
        if self._closed:
            raise VividError(
                f"session {self._info.id} is closed; open a new one with "
                "client.browser.session()")

    async def goto(self, url: str) -> NavResult:
        self._check_open()
        data = await self._t.request("POST", self._path("/goto"),
                                     json_body={"url": url},
                                     timeout=BROWSE_TIMEOUT)
        self._last_snapshot = None
        return NavResult.from_dict(data or {})

    async def snapshot(self) -> Snapshot:
        self._check_open()
        data = await self._t.request("POST", self._path("/snapshot"),
                                     json_body={}, timeout=BROWSE_TIMEOUT)
        snap = Snapshot.from_dict(data or {})
        self._last_snapshot = snap.snapshot_id
        return snap

    async def text(self, selector: str = "body") -> str:
        self._check_open()
        data = await self._t.request("POST", self._path("/text"),
                                     json_body={"selector": selector},
                                     timeout=BROWSE_TIMEOUT)
        return (data or {}).get("text", "")

    async def _act(self, target: Element | int, action: str,
                   value: str | Secret = "") -> ActResult:
        self._check_open()
        body = _act_payload(self._last_snapshot, target, action, value)
        data = await self._t.request("POST", self._path("/act"),
                                     json_body=body, timeout=BROWSE_TIMEOUT)
        self._last_snapshot = None
        return ActResult.from_dict(data or {})

    async def click(self, target: Element | int) -> ActResult:
        return await self._act(target, "click")

    async def type(self, target: Element | int,
                   value: str | Secret) -> ActResult:
        return await self._act(target, "type", value)

    async def submit(self, target: Element | int,
                     value: str | Secret = "") -> ActResult:
        return await self._act(target, "submit", value)

    async def storage_state(self) -> dict:
        self._check_open()
        data = await self._t.request("GET", self._path("/storage_state"))
        return (data or {}).get("storage_state") or {}

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        with contextlib.suppress(VividError):
            await self._t.request("DELETE", self._path())

    async def __aenter__(self) -> AsyncBrowserSession:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()


class AsyncBrowsingTask:
    """Async twin of BrowsingTask: `async for step in task`."""

    def __init__(self, transport: AsyncTransport, payload: dict) -> None:
        self._t = transport
        self._payload = payload
        self._steps: list[TaskStep] = []
        self._result: TaskResult | None = None
        self._done = False

    @property
    def steps(self) -> list[TaskStep]:
        return list(self._steps)

    async def __aiter__(self) -> AsyncIterator[TaskStep]:
        if self._done:
            for step in self._steps:
                yield step
            return
        stream = self._t.stream_sse("POST", "/browser/tasks",
                                    json_body={**self._payload, "stream": True})
        async for event, data in stream:
            if event == "step":
                step = TaskStep.from_dict(data, len(self._steps))
                self._steps.append(step)
                yield step
            elif event == "result":
                self._result = TaskResult.from_dict(data)
            elif event == "error":
                self._done = True
                raise TaskFailed((data or {}).get("message")
                                 or "the browsing task failed")
        self._done = True

    async def result(self) -> TaskResult:
        async for _ in self:
            pass
        if self._result is None:
            raise TaskFailed("the task ended without producing a result")
        return self._result


class AsyncBrowser:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def session(self, *, storage_state: dict | None = None,
                      allowed_domains: Sequence[str] | None = None,
                      idle_ttl: int | None = None) -> AsyncBrowserSession:
        body = _session_payload(storage_state, allowed_domains, idle_ttl)
        data = await self._t.request("POST", "/browser/sessions",
                                     json_body=body, timeout=BROWSE_TIMEOUT)
        return AsyncBrowserSession(self._t,
                                   BrowserSessionInfo.from_dict(data or {}))

    async def sessions(self) -> list[BrowserSessionInfo]:
        data = await self._t.request("GET", "/browser/sessions")
        return [BrowserSessionInfo.from_dict(s) for s in (data or [])]

    async def close(self, session_id: str) -> None:
        await self._t.request("DELETE", f"/browser/sessions/{session_id}")

    def run(self, *, goal: str, url: str | None = None, max_steps: int = 8,
            session: AsyncBrowserSession | str | None = None,
            allowed_domains: Sequence[str] | None = None) -> AsyncBrowsingTask:
        if not goal or not goal.strip():
            raise ValueError("goal is required")
        if session is None and not url:
            raise ValueError("url is required when no session is given")
        if not 1 <= max_steps <= MAX_STEPS_LIMIT:
            raise ValueError(f"max_steps must be 1..{MAX_STEPS_LIMIT}")

        payload: dict[str, Any] = {"goal": goal.strip(),
                                   "max_steps": int(max_steps)}
        if url:
            payload["url"] = url
        if session is not None:
            payload["session_id"] = (session.id
                                     if isinstance(session, AsyncBrowserSession)
                                     else session)
        if allowed_domains:
            payload["allowed_domains"] = list(allowed_domains)
        return AsyncBrowsingTask(self._t, payload)
