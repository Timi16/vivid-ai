"""HTTP plumbing: auth, retries, error mapping, SSE.

Sync and async share every decision through the module-level helpers; the two
client classes differ only in how they await. That matters more than it looks —
retry policy and error mapping drifting between the two is a classic SDK bug,
and the only reliable fix is to have one copy of the logic.
"""
from __future__ import annotations

import json
import random
import time
from collections.abc import AsyncIterator, Iterator
from typing import Any

import httpx

from ._version import __version__
from .errors import ConnectionError_, VividError, from_response

DEFAULT_BASE_URL = "http://localhost:8000"
DEFAULT_TIMEOUT = 60.0
#: Browsing calls wait on a real page load, so they get their own, longer
#: budget. A managed task waits on a page load per step.
BROWSE_TIMEOUT = 120.0
DEFAULT_MAX_RETRIES = 2

#: Retried when the request is safe to repeat. 409 is absent deliberately: it
#: means "already generating", and hammering it just burns the rate limit.
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


def _user_agent() -> str:
    return f"vivid-ai-python/{__version__}"


def _default_headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}",
            "User-Agent": _user_agent(),
            "Accept": "application/json"}


def _prepare(path: str, *, json_body: Any = None, params: dict | None = None,
             files: Any = None, data: dict | None = None) -> dict:
    kwargs: dict[str, Any] = {}
    if json_body is not None:
        kwargs["json"] = json_body
    if params:
        kwargs["params"] = {k: v for k, v in params.items() if v is not None}
    if files is not None:
        kwargs["files"] = files
    if data is not None:
        kwargs["data"] = data
    return kwargs


def _should_retry(method: str, retry: bool | None) -> bool:
    if retry is not None:
        return retry
    # GET is safe by definition. POST is not: repeating a click or a navigation
    # is a second real action, and the browsing surface is full of those.
    return method.upper() in ("GET", "HEAD")


def _backoff(attempt: int, retry_after: float | None) -> float:
    if retry_after is not None:
        return min(retry_after, 30.0)
    # Full jitter: synchronised retries from a fleet of agents are exactly the
    # load the browser tier can least afford.
    return random.uniform(0, min(0.5 * (2 ** attempt), 8.0))


def _retry_after(response: httpx.Response) -> float | None:
    raw = response.headers.get("retry-after")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _parse(response: httpx.Response) -> Any:
    if response.status_code == 204 or not response.content:
        return None
    ctype = response.headers.get("content-type", "")
    if "json" not in ctype:
        return response.content
    try:
        return response.json()
    except ValueError:
        return None


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code < 400:
        return
    body = _parse(response)
    raise from_response(response.status_code,
                        body if isinstance(body, dict) else None,
                        _retry_after(response))


def _sse_events(lines: Iterator[str]) -> Iterator[tuple[str, Any]]:
    """Minimal SSE reader: yields (event, parsed data) pairs.

    Only what the API emits is supported — `event:` and `data:`, one JSON
    object per event. Multi-line data is concatenated, per the spec, because
    a long answer field will wrap.
    """
    event = "message"
    payload: list[str] = []
    for line in lines:
        line = line.rstrip("\r")
        if not line:
            if payload:
                raw = "\n".join(payload)
                payload = []
                name, event = event, "message"
                if raw != "[DONE]":
                    try:
                        yield name, json.loads(raw)
                    except json.JSONDecodeError:
                        continue
            continue
        if line.startswith(":"):
            continue                                  # comment / keep-alive
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            payload.append(line[5:].lstrip())


class Transport:
    """Synchronous HTTP."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL,
                 timeout: float = DEFAULT_TIMEOUT,
                 max_retries: int = DEFAULT_MAX_RETRIES,
                 client: httpx.Client | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self._owns_client = client is None
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(timeout, connect=10.0),
            # Keep-alive matters: a browsing loop is dozens of small calls, and
            # a fresh handshake on each would dominate the latency.
            limits=httpx.Limits(max_connections=50,
                                max_keepalive_connections=20),
        )
        # Applied even to a client the caller supplied. Someone passing their
        # own client wants their proxy or CA settings, not to opt out of
        # authentication — dropping the header there would fail as a confusing
        # 401 far from the cause.
        self._client.headers.update(_default_headers(api_key))

    def request(self, method: str, path: str, *, json_body: Any = None,
                params: dict | None = None, files: Any = None,
                data: dict | None = None, timeout: float | None = None,
                retry: bool | None = None) -> Any:
        kwargs = _prepare(path, json_body=json_body, params=params,
                          files=files, data=data)
        if timeout is not None:
            kwargs["timeout"] = timeout
        url = f"{self.base_url}/v1{path}"
        attempts = self.max_retries if _should_retry(method, retry) else 0
        last: Exception | None = None

        for attempt in range(attempts + 1):
            try:
                response = self._client.request(method, url, **kwargs)
            except httpx.TimeoutException as e:
                last = ConnectionError_(f"request timed out: {e}")
            except httpx.HTTPError as e:
                last = ConnectionError_(f"could not reach Vivid: {e}")
            else:
                if response.status_code in RETRY_STATUSES and attempt < attempts:
                    time.sleep(_backoff(attempt, _retry_after(response)))
                    continue
                _raise_for_status(response)
                return _parse(response)
            if attempt < attempts:
                time.sleep(_backoff(attempt, None))
        raise last or ConnectionError_("request failed")

    def stream_sse(self, method: str, path: str, *, json_body: Any = None,
                   timeout: float | None = None) -> Iterator[tuple[str, Any]]:
        kwargs = _prepare(path, json_body=json_body)
        kwargs["headers"] = {"Accept": "text/event-stream"}
        with self._client.stream(method, f"{self.base_url}/v1{path}",
                                 timeout=timeout or BROWSE_TIMEOUT,
                                 **kwargs) as response:
            if response.status_code >= 400:
                response.read()
                _raise_for_status(response)
            yield from _sse_events(response.iter_lines())

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> Transport:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


class AsyncTransport:
    """Asynchronous HTTP. Same policy, awaited."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE_URL,
                 timeout: float = DEFAULT_TIMEOUT,
                 max_retries: int = DEFAULT_MAX_RETRIES,
                 client: httpx.AsyncClient | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=10.0),
            limits=httpx.Limits(max_connections=50,
                                max_keepalive_connections=20),
        )
        self._client.headers.update(_default_headers(api_key))

    async def request(self, method: str, path: str, *, json_body: Any = None,
                      params: dict | None = None, files: Any = None,
                      data: dict | None = None, timeout: float | None = None,
                      retry: bool | None = None) -> Any:
        import asyncio

        kwargs = _prepare(path, json_body=json_body, params=params,
                          files=files, data=data)
        if timeout is not None:
            kwargs["timeout"] = timeout
        url = f"{self.base_url}/v1{path}"
        attempts = self.max_retries if _should_retry(method, retry) else 0
        last: Exception | None = None

        for attempt in range(attempts + 1):
            try:
                response = await self._client.request(method, url, **kwargs)
            except httpx.TimeoutException as e:
                last = ConnectionError_(f"request timed out: {e}")
            except httpx.HTTPError as e:
                last = ConnectionError_(f"could not reach Vivid: {e}")
            else:
                if response.status_code in RETRY_STATUSES and attempt < attempts:
                    await asyncio.sleep(_backoff(attempt, _retry_after(response)))
                    continue
                _raise_for_status(response)
                return _parse(response)
            if attempt < attempts:
                await asyncio.sleep(_backoff(attempt, None))
        raise last or ConnectionError_("request failed")

    async def stream_sse(self, method: str, path: str, *, json_body: Any = None,
                         timeout: float | None = None
                         ) -> AsyncIterator[tuple[str, Any]]:
        kwargs = _prepare(path, json_body=json_body)
        kwargs["headers"] = {"Accept": "text/event-stream"}
        async with self._client.stream(method, f"{self.base_url}/v1{path}",
                                       timeout=timeout or BROWSE_TIMEOUT,
                                       **kwargs) as response:
            if response.status_code >= 400:
                await response.aread()
                _raise_for_status(response)
            event = "message"
            payload: list[str] = []
            async for line in response.aiter_lines():
                line = line.rstrip("\r")
                if not line:
                    if payload:
                        raw = "\n".join(payload)
                        payload = []
                        name, event = event, "message"
                        if raw != "[DONE]":
                            try:
                                yield name, json.loads(raw)
                            except json.JSONDecodeError:
                                continue
                    continue
                if line.startswith(":"):
                    continue
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    payload.append(line[5:].lstrip())

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> AsyncTransport:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()


__all__ = ["BROWSE_TIMEOUT", "AsyncTransport", "Transport", "VividError"]
