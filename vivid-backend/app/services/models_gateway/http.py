"""One shared persistent HTTP client for all model-service and tool calls.

A fresh client per request paid a full TCP+TLS handshake through the RunPod
proxy (~100-300ms) on EVERY model call. Keep-alive connections make each hop
after the first ride an already-open pipe — the same latency profile as a
persistent websocket, without connection state to resurrect when a pod dies.
Per-request timeouts are passed at the call site.
"""
import httpx

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(120, connect=10),
            limits=httpx.Limits(max_connections=50,
                                max_keepalive_connections=20,
                                keepalive_expiry=90),
            headers={"User-Agent": "VividAI-backend/0.1"},
        )
    return _client


async def aclose() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
