"""Playwright lifecycle and per-session browser contexts.

One browser process, one context per session. Contexts are isolated (cookies,
storage) and cheap to discard, which matters because a page the agent visited
must not leak state into the next user's session.

Sessions are created explicitly now (`open`) rather than springing into
existence on first use, because a partner session carries configuration —
replayed cookies, an egress allowlist — that has to be applied when the
context is built, not discovered afterwards.
"""
import asyncio
import time
from dataclasses import dataclass, field
from typing import Optional

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

from ..config import settings


class CapacityExceeded(RuntimeError):
    """The tier is full and no session could be evicted.

    Replaces the old silent LRU. Closing someone's oldest session to make room
    was defensible while the backend was the only caller; with partners
    sharing the pool it would destroy in-flight work belonging to another
    tenant — and an evicted authenticated session means a lost login, not just
    a lost page.
    """


@dataclass
class Session:
    context: BrowserContext
    page: Page
    last_seen: float = field(default_factory=time.time)
    refs: list = field(default_factory=list)     # last snapshot's elements
    #: Hosts this session may reach. Empty means unrestricted.
    allowed_domains: list = field(default_factory=list)
    #: Element indices the caller filled with a secret, so later snapshots
    #: keep describing them as secret even if the page drops the attribute.
    secret_refs: set = field(default_factory=set)
    #: True when opened with replayed cookies.
    authenticated: bool = False


class BrowserPool:
    def __init__(self) -> None:
        self._pw = None
        self._browser: Optional[Browser] = None
        self._sessions: dict[str, Session] = {}
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        self._pw = await async_playwright().start()
        # --disable-dev-shm-usage: containers give /dev/shm 64MB by default and
        # Chromium crashes on media-heavy pages without this.
        self._browser = await self._pw.chromium.launch(
            headless=True, args=["--disable-dev-shm-usage", "--no-zygote"])

    async def stop(self) -> None:
        for sid in list(self._sessions):
            await self.close(sid)
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()

    async def _reap(self) -> None:
        cutoff = time.time() - settings().session_ttl
        for sid, s in list(self._sessions.items()):
            if s.last_seen < cutoff:
                await self.close(sid)

    async def _new_context(self, storage_state: dict | None) -> BrowserContext:
        kwargs = {"viewport": {"width": 1280, "height": 800},
                  "user_agent": "Mozilla/5.0 (compatible; VividBot/1.0)"}
        if storage_state:
            # Playwright's own auth pattern: replay cookies and localStorage
            # instead of ever handling a credential.
            kwargs["storage_state"] = storage_state
        return await self._browser.new_context(**kwargs)

    async def open(self, sid: str, *, storage_state: dict | None = None,
                   allowed_domains: list | None = None) -> Session:
        """Create a session explicitly. Raises CapacityExceeded when full."""
        cfg = settings()
        async with self._lock:
            await self._reap()
            existing = self._sessions.get(sid)
            if existing is not None:
                existing.last_seen = time.time()
                return existing
            if len(self._sessions) >= cfg.max_sessions:
                raise CapacityExceeded(
                    f"all {cfg.max_sessions} browser sessions are in use")
            ctx = await self._new_context(storage_state)
            page = await ctx.new_page()
            page.set_default_timeout(cfg.nav_timeout_ms)
            s = self._sessions[sid] = Session(
                context=ctx, page=page,
                allowed_domains=[d.lower() for d in (allowed_domains or [])],
                authenticated=bool(storage_state))
            return s

    async def session(self, sid: str) -> Session:
        """Fetch a live session. Unknown ids are an error rather than an
        implicit create: snapshotting or clicking in a session that does not
        exist means it expired, and silently opening a blank one would answer
        questions about the wrong page."""
        async with self._lock:
            await self._reap()
            s = self._sessions.get(sid)
            if s is None:
                raise KeyError(sid)
            s.last_seen = time.time()
            return s

    async def ensure(self, sid: str) -> Session:
        """Fetch a session, opening a plain one if it does not exist yet.

        Only navigation uses this. The chat tool has always addressed sessions
        by a chat-derived id without opening them first, and a first `goto` is
        an unambiguous "start here" — unlike a snapshot, which would silently
        describe a blank page.
        """
        try:
            return await self.session(sid)
        except KeyError:
            return await self.open(sid)

    async def close(self, sid: str) -> bool:
        s = self._sessions.pop(sid, None)
        if not s:
            return False
        try:
            await s.context.close()
        except Exception:
            pass
        return True

    @property
    def count(self) -> int:
        return len(self._sessions)


pool = BrowserPool()
