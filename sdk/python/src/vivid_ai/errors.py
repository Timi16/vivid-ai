"""Typed errors, mapped from the API's error envelope.

Every failure the browsing surface can produce gets its own class, because the
retry decision differs for each: a stale ref means take a fresh snapshot, a
capacity error means back off and retry, a blocked URL means the request was
wrong and retrying is pointless. A single VividError with a string would push
that decision onto every caller.
"""
from __future__ import annotations


class VividError(Exception):
    """Base for everything this SDK raises."""

    #: Wire code this class is registered for. None on classes that are only
    #: raised locally (e.g. StaleRef when the SDK catches it client-side).
    code: str | None = None

    def __init__(self, message: str, *, request_id: str | None = None,
                 status: int | None = None, body: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.request_id = request_id
        self.status = status
        self.body = body or {}

    def __str__(self) -> str:
        if self.request_id:
            return f"{self.message} (request_id={self.request_id})"
        return self.message


# --- connection / protocol --------------------------------------------------
class ConnectionError_(VividError):
    """The request never reached Vivid: DNS, refused, TLS, timeout."""


class APIError(VividError):
    """A non-2xx the SDK has no more specific class for."""


# --- auth -------------------------------------------------------------------
class Unauthorized(VividError):
    code = "unauthorized"


class Forbidden(VividError):
    code = "forbidden"


class NotFound(VividError):
    code = "not_found"


# --- limits -----------------------------------------------------------------
class RateLimited(VividError):
    code = "rate_limited"

    def __init__(self, message: str, *, retry_after: float | None = None,
                 **kw) -> None:
        super().__init__(message, **kw)
        self.retry_after = retry_after


class QuotaExceeded(VividError):
    """This API key already holds its maximum concurrent browser sessions."""
    code = "quota_exceeded"


class CapacityExceeded(VividError):
    """The browser tier itself is full. Unlike QuotaExceeded this is not your
    fault and is worth retrying with backoff."""
    code = "capacity_exceeded"


class Busy(VividError):
    """A generation is already running for this user."""
    code = "busy"


# --- browsing ---------------------------------------------------------------
class BrowserError(VividError):
    """Base for browsing-specific failures."""


class SessionExpired(BrowserError):
    """The session was reaped after its idle TTL, or explicitly closed."""
    code = "session_expired"


class StaleRef(BrowserError):
    """The element ref came from a snapshot that is no longer current. Refs are
    positional and regenerate on every snapshot, so take a fresh one."""
    code = "stale_ref"


class BlockedUrl(BrowserError):
    """Refused by the SSRF guard: private, loopback, link-local or metadata."""
    code = "blocked_url"


class DomainNotAllowed(BrowserError):
    """Navigation outside the session's allowed_domains. Authenticated sessions
    carry live cookies, so egress is restricted by design."""
    code = "domain_not_allowed"


class NavTimeout(BrowserError):
    code = "nav_timeout"


class ElementNotFound(BrowserError):
    """No element on the snapshot matched. Raised locally by Snapshot.find."""
    code = "element_not_found"


# --- models -----------------------------------------------------------------
class ModelUnavailable(VividError):
    """The LLM, STT, TTS or translate service could not be reached."""
    code = "llm_error"


class TaskFailed(VividError):
    """A managed browsing task ended without producing an answer."""
    code = "task_failed"


#: Wire code -> exception class. Anything unmapped becomes APIError, so a new
#: server-side code degrades instead of breaking old SDKs.
BY_CODE: dict[str, type[VividError]] = {
    cls.code: cls
    for cls in (
        Unauthorized, Forbidden, NotFound, RateLimited, QuotaExceeded,
        CapacityExceeded, Busy, SessionExpired, StaleRef, BlockedUrl,
        DomainNotAllowed, NavTimeout, ElementNotFound, ModelUnavailable,
        TaskFailed,
    )
    if cls.code
}

#: Fallback when the body carries no code — HTTP status is all we have.
BY_STATUS: dict[int, type[VividError]] = {
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    409: Busy,
    429: RateLimited,
    503: ModelUnavailable,
}


def from_response(status: int, body: dict | None,
                  retry_after: float | None = None) -> VividError:
    """Build the right exception from an error response.

    The envelope is {"error": {"code", "message", "request_id"}}. FastAPI's
    older {"detail": "..."} shape is still accepted, because parts of the API
    predate the envelope and an SDK that only understood the new shape would
    report every one of those as an unhelpful blank message.
    """
    body = body or {}
    envelope = body.get("error")
    if isinstance(envelope, dict):
        code = envelope.get("code")
        message = envelope.get("message") or f"request failed ({status})"
        request_id = envelope.get("request_id")
    else:
        code = None
        detail = body.get("detail")
        message = detail if isinstance(detail, str) else f"request failed ({status})"
        request_id = None

    cls = BY_CODE.get(code or "") or BY_STATUS.get(status) or APIError
    if cls is RateLimited:
        return RateLimited(message, retry_after=retry_after,
                           request_id=request_id, status=status, body=body)
    return cls(message, request_id=request_id, status=status, body=body)
