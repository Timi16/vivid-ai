"""Playwright lifecycle and per-session browser contexts.

One browser process, one context per session. Contexts are isolated (cookies,
storage) and cheap to discard, which matters because a page the agent visited
must not leak state into the next user's session.
"""
import asyncio
import time
from dataclasses import dataclass, field
from typing import Optional

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

from ..config import settings


@dataclass
class Session:
    context: BrowserContext
    page: Page
    last_seen: float = field(default_factory=time.time)
    refs: list = field(default_factory=list)     # last snapshot's elements


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

    async def session(self, sid: str) -> Session:
        cfg = settings()
        async with self._lock:
            await self._reap()
            s = self._sessions.get(sid)
            if s is None:
                if len(self._sessions) >= cfg.max_sessions:
                    oldest = min(self._sessions,
                                 key=lambda k: self._sessions[k].last_seen)
                    await self.close(oldest)
                ctx = await self._browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent="Mozilla/5.0 (compatible; VividBot/1.0)")
                page = await ctx.new_page()
                page.set_default_timeout(cfg.nav_timeout_ms)
                s = self._sessions[sid] = Session(context=ctx, page=page)
            s.last_seen = time.time()
            return s

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
