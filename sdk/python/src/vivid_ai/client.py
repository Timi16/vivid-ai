"""The client objects: `Vivid` and `AsyncVivid`."""
from __future__ import annotations

import os

import httpx

from ._transport import (
    DEFAULT_BASE_URL,
    DEFAULT_MAX_RETRIES,
    DEFAULT_TIMEOUT,
    AsyncTransport,
    Transport,
)
from .resources.browser import AsyncBrowser, Browser
from .resources.chats import AsyncChats, Chats
from .resources.core import (
    Artifacts,
    AsyncArtifacts,
    AsyncAttachments,
    AsyncHealth,
    Attachments,
    Health,
)
from .types import SearchResult

ENV_API_KEY = "VIVID_API_KEY"
ENV_BASE_URL = "VIVID_BASE_URL"


def _resolve_key(api_key: str | None) -> str:
    key = api_key or os.environ.get(ENV_API_KEY)
    if not key:
        raise ValueError(
            "no API key: pass Vivid(api_key=...) or set the "
            f"{ENV_API_KEY} environment variable")
    return key


def _resolve_base(base_url: str | None) -> str:
    return base_url or os.environ.get(ENV_BASE_URL) or DEFAULT_BASE_URL


class Vivid:
    """Synchronous client.

        from vivid_ai import Vivid

        vivid = Vivid(api_key="vk_...")
        with vivid.browser.session() as s:
            s.goto("https://example.com")
            print(s.snapshot().title)

    Close it when you are done — or use it as a context manager — so the
    underlying connection pool is released.
    """

    def __init__(self, api_key: str | None = None, *,
                 base_url: str | None = None,
                 timeout: float = DEFAULT_TIMEOUT,
                 max_retries: int = DEFAULT_MAX_RETRIES,
                 http_client: httpx.Client | None = None) -> None:
        self._transport = Transport(_resolve_key(api_key),
                                    _resolve_base(base_url),
                                    timeout=timeout, max_retries=max_retries,
                                    client=http_client)
        self.browser = Browser(self._transport)
        self.chats = Chats(self._transport)
        self.attachments = Attachments(self._transport)
        self.artifacts = Artifacts(self._transport)
        self.health = Health(self._transport)

    @property
    def base_url(self) -> str:
        return self._transport.base_url

    def search(self, query: str, *, limit: int = 20) -> list[SearchResult]:
        """Search across this account's chats."""
        data = self._transport.request("GET", "/search",
                                       params={"q": query, "limit": limit})
        return [SearchResult.from_dict(r)
                for r in ((data or {}).get("results") or [])]

    def close(self) -> None:
        self._transport.close()

    def __enter__(self) -> Vivid:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def __repr__(self) -> str:
        return f"<Vivid base_url={self._transport.base_url!r}>"


class AsyncVivid:
    """Asynchronous client. Same surface, awaited.

        async with AsyncVivid(api_key="vk_...") as vivid:
            async with await vivid.browser.session() as s:
                await s.goto("https://example.com")
    """

    def __init__(self, api_key: str | None = None, *,
                 base_url: str | None = None,
                 timeout: float = DEFAULT_TIMEOUT,
                 max_retries: int = DEFAULT_MAX_RETRIES,
                 http_client: httpx.AsyncClient | None = None) -> None:
        self._transport = AsyncTransport(_resolve_key(api_key),
                                         _resolve_base(base_url),
                                         timeout=timeout,
                                         max_retries=max_retries,
                                         client=http_client)
        self.browser = AsyncBrowser(self._transport)
        self.chats = AsyncChats(self._transport)
        self.attachments = AsyncAttachments(self._transport)
        self.artifacts = AsyncArtifacts(self._transport)
        self.health = AsyncHealth(self._transport)

    @property
    def base_url(self) -> str:
        return self._transport.base_url

    async def search(self, query: str, *, limit: int = 20) -> list[SearchResult]:
        data = await self._transport.request("GET", "/search",
                                             params={"q": query,
                                                     "limit": limit})
        return [SearchResult.from_dict(r)
                for r in ((data or {}).get("results") or [])]

    async def close(self) -> None:
        await self._transport.close()

    async def __aenter__(self) -> AsyncVivid:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()

    def __repr__(self) -> str:
        return f"<AsyncVivid base_url={self._transport.base_url!r}>"
