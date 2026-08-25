"""Ownership, quotas and egress rules for partner browser sessions.

vivid-tools keys sessions by an arbitrary caller-supplied string. That was fine
while the backend was its only caller; with API keys it is a tenancy hole —
anyone could pass someone else's session id and drive their browser, cookies
and logged-in state included. So ids are issued here, stored against their
owner, and every call is checked before it reaches the browser service.

The registry lives in Redis because sessions outlive a request and the backend
runs more than one worker. Unlike the rate limiter, this **fails closed**: if
Redis is unavailable we cannot prove who owns a session, and guessing would
mean handing one partner another's authenticated browser.
"""
import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from urllib.parse import urlparse

from app.core.config import settings
from app.core.errors import APIError

log = logging.getLogger("vivid.browser")

SESSION_PREFIX = "browser:session:"
OWNER_PREFIX = "browser:owner:"


@dataclass
class SessionRecord:
    id: str
    owner_id: str
    user_id: str
    allowed_domains: list[str] = field(default_factory=list)
    authenticated: bool = False
    idle_ttl: int = 0
    created_at: float = 0.0
    #: The snapshot refs currently point into. Element refs are positional and
    #: renumbered every snapshot, so an act carrying a different id is acting
    #: on a page that has moved underneath it.
    snapshot_id: str = ""

    def public(self, now: float | None = None) -> dict:
        now = now or time.time()
        return {
            "id": self.id,
            "allowed_domains": self.allowed_domains,
            "authenticated": self.authenticated,
            "created_at": _iso(self.created_at),
            "expires_at": _iso(now + self.idle_ttl),
        }


def _iso(epoch: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def _skey(session_id: str) -> str:
    return f"{SESSION_PREFIX}{session_id}"


def _okey(owner_id: str) -> str:
    return f"{OWNER_PREFIX}{owner_id}"


def _unavailable(exc: Exception) -> APIError:
    log.error("browser session registry unavailable: %s", exc)
    return APIError(503, "service_unavailable",
                    "session storage is unavailable; retry shortly")


# ---------------------------------------------------------------- domains
def normalise_domains(domains: list[str] | None) -> list[str]:
    out = []
    for raw in domains or []:
        host = str(raw).strip().lower().lstrip("*.")
        if not host:
            continue
        # Accept a full URL as well as a bare host: passing
        # "https://example.com" is the obvious mistake and there is no reason
        # to punish it.
        if "://" in host:
            host = urlparse(host).hostname or ""
        host = host.split("/")[0].split(":")[0]
        if host and host not in out:
            out.append(host)
    return out


def url_allowed(record: SessionRecord, url: str) -> bool:
    """True when `url` is inside the session's allowed domains.

    An empty allowlist means unrestricted, which is only reachable for
    unauthenticated sessions — the route layer requires domains whenever
    storage state is supplied.
    """
    if not record.allowed_domains:
        return True
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return False
    return any(host == d or host.endswith(f".{d}")
               for d in record.allowed_domains)


def assert_url_allowed(record: SessionRecord, url: str) -> None:
    if url_allowed(record, url):
        return
    raise APIError(
        403, "domain_not_allowed",
        f"this session may only reach {', '.join(record.allowed_domains)}; "
        f"refusing to navigate to {url[:120]}")


# ---------------------------------------------------------------- registry
async def create(redis, *, owner_id: str, user_id: str,
                 allowed_domains: list[str] | None, authenticated: bool,
                 idle_ttl: int | None, max_sessions: int) -> SessionRecord:
    ttl = idle_ttl or settings.BROWSER_SESSION_TTL
    ttl = max(60, min(ttl, settings.BROWSER_SESSION_TTL_MAX))

    used = await count_for_owner(redis, owner_id)
    if used >= max_sessions:
        # Refusing here rather than letting the browser pool evict its oldest
        # session: an evicted authenticated session means a lost login, and
        # the caller gets no say in which one dies.
        raise APIError(
            429, "quota_exceeded",
            f"this key already holds {used} of {max_sessions} concurrent "
            "browser sessions; close one before opening another")

    record = SessionRecord(
        id=f"bs_{uuid.uuid4().hex[:24]}", owner_id=owner_id, user_id=user_id,
        allowed_domains=normalise_domains(allowed_domains),
        authenticated=authenticated, idle_ttl=ttl, created_at=time.time())
    try:
        await redis.set(_skey(record.id), json.dumps(asdict(record)), ex=ttl)
        await redis.sadd(_okey(owner_id), record.id)
        # The owner set has no natural expiry; bound it so an abandoned owner
        # cannot leak keys forever. Refreshed on every create.
        await redis.expire(_okey(owner_id), settings.BROWSER_SESSION_TTL_MAX * 2)
    except APIError:
        raise
    except Exception as e:
        raise _unavailable(e) from e
    return record


async def get(redis, session_id: str, owner_id: str) -> SessionRecord:
    """Fetch a session, refusing anything this owner does not hold.

    A session owned by someone else returns 404, not 403: a partner must not be
    able to probe which session ids exist.
    """
    try:
        raw = await redis.get(_skey(session_id))
    except Exception as e:
        raise _unavailable(e) from e
    if raw is None:
        raise APIError(404, "session_expired",
                       f"session {session_id} does not exist, or was reaped "
                       "after its idle timeout")
    record = SessionRecord(**json.loads(raw))
    if record.owner_id != owner_id:
        log.warning("session %s requested by non-owner %s", session_id, owner_id)
        raise APIError(404, "session_expired",
                       f"session {session_id} does not exist, or was reaped "
                       "after its idle timeout")
    return record


async def save(redis, record: SessionRecord) -> None:
    """Persist and slide the idle window — every use keeps a session alive."""
    try:
        await redis.set(_skey(record.id), json.dumps(asdict(record)),
                        ex=record.idle_ttl)
    except Exception as e:
        raise _unavailable(e) from e


async def set_snapshot(redis, record: SessionRecord, snapshot_id: str) -> None:
    record.snapshot_id = snapshot_id
    await save(redis, record)


async def close(redis, session_id: str, owner_id: str) -> None:
    try:
        await redis.delete(_skey(session_id))
        await redis.srem(_okey(owner_id), session_id)
    except Exception as e:
        raise _unavailable(e) from e


async def list_for_owner(redis, owner_id: str) -> list[SessionRecord]:
    """Live sessions for this owner, pruning ids whose sessions have expired."""
    try:
        ids = sorted(await redis.smembers(_okey(owner_id)))
        if not ids:
            return []
        rows = await redis.mget([_skey(i) for i in ids])
    except Exception as e:
        raise _unavailable(e) from e

    records, stale = [], []
    for session_id, raw in zip(ids, rows):
        if raw is None:
            stale.append(session_id)
            continue
        records.append(SessionRecord(**json.loads(raw)))
    if stale:
        try:
            await redis.srem(_okey(owner_id), *stale)
        except Exception:
            pass                       # pruning is housekeeping, never fatal
    return records


async def count_for_owner(redis, owner_id: str) -> int:
    return len(await list_for_owner(redis, owner_id))
