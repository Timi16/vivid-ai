"""One client for the vivid-tools browser service.

Both callers — the chat `browse` tool and the partner `/v1/browser` routes —
go through here, so retry, auth and error translation exist once. The service's
failures become APIErrors with codes the SDK already understands.
"""
import logging

import httpx

from app.core.config import settings
from app.core.errors import APIError
from app.services.models_gateway import http

log = logging.getLogger("vivid.tools")

#: Substrings vivid-tools puts in its error strings, mapped to the codes the
#: SDK branches on. It reports failures as {"ok": false, "error": "..."} with
#: a 200, so there is no status to switch on.
_ERROR_CODES = [
    ("blocked:", (400, "blocked_url")),
    ("no element", (409, "stale_ref")),
    ("take a fresh snapshot", (409, "stale_ref")),
    ("timeout", (504, "nav_timeout")),
    ("timed out", (504, "nav_timeout")),
    ("net::err", (502, "navigation_failed")),
]


class BrowserServiceUnavailable(APIError):
    def __init__(self, message: str) -> None:
        super().__init__(503, "browser_unavailable", message)


def configured() -> bool:
    return bool(settings.VIVID_TOOLS_URL)


def _headers() -> dict:
    if settings.VIVID_TOOLS_TOKEN:
        return {"Authorization": f"Bearer {settings.VIVID_TOOLS_TOKEN}"}
    return {}


def _translate(error: str) -> APIError:
    lowered = error.lower()
    for needle, (status, code) in _ERROR_CODES:
        if needle in lowered:
            return APIError(status, code, error[:300])
    return APIError(502, "browser_error", error[:300])


async def call(path: str, payload: dict, timeout: int = 40) -> dict:
    """POST to vivid-tools and return its `data`, raising APIError on failure."""
    if not configured():
        raise BrowserServiceUnavailable("the browser service is not configured")
    base = settings.VIVID_TOOLS_URL.rstrip("/")
    try:
        r = await http.client().post(f"{base}{path}", json=payload,
                                     headers=_headers(), timeout=timeout)
        r.raise_for_status()
        body = r.json()
    except httpx.TimeoutException as e:
        raise APIError(504, "nav_timeout",
                       f"the browser did not respond in time: {e}") from e
    except httpx.HTTPError as e:
        raise BrowserServiceUnavailable(f"browser service unreachable: {e}") from e
    except ValueError as e:
        raise APIError(502, "browser_error",
                       f"browser service returned malformed JSON: {e}") from e

    if not body.get("ok", True):
        raise _translate(str(body.get("error") or "browser error"))
    return body.get("data") or {}
