"""The partner browsing API.

Two layers on one session model:

  /browser/sessions/*   you drive — goto, snapshot, act, read
  /browser/tasks        Vivid drives — a goal, and the trail of actions

Sessions are issued and owned here (see services/browser_sessions), so a
partner can only touch their own, and an authenticated session cannot navigate
off the domains it declared.
"""
import json
import logging
from typing import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.deps import Principal, get_principal
from app.core.errors import APIError
from app.schemas.browser import (ActOut, ActRequest, GotoRequest, NavOut,
                                 SessionCreate, SessionOut, SnapshotOut,
                                 StorageStateOut, TaskRequest, TaskResultOut,
                                 TextOut, TextRequest)
from app.services import browser_sessions, browsing, vivid_tools

router = APIRouter(prefix="/browser", tags=["browser"])
log = logging.getLogger("vivid.browser.api")


def _redis(request: Request):
    redis = getattr(request.app.state, "redis", None)
    if redis is None:
        raise APIError(503, "service_unavailable",
                       "session storage is unavailable; retry shortly")
    return redis


def _require_service() -> None:
    if not vivid_tools.configured():
        raise APIError(503, "browser_unavailable",
                       "the browser service is not configured on this deployment")


async def _driver(request: Request, session_id: str,
                  principal: Principal) -> browsing.SessionDriver:
    redis = _redis(request)
    record = await browser_sessions.get(redis, session_id, principal.owner_id)
    return browsing.SessionDriver(redis, record)


# ------------------------------------------------------------------ sessions
@router.post("/sessions", response_model=SessionOut, status_code=201)
async def create_session(body: SessionCreate, request: Request,
                         principal: Principal = Depends(get_principal)):
    """Open a browser session.

    Pass `storage_state` to resume an authenticated one. `allowed_domains` is
    then required: a session carrying live cookies with unrestricted egress is
    a credential-theft primitive, because the controller picks navigation from
    page text an attacker can write.
    """
    _require_service()
    authenticated = bool(body.storage_state)
    if authenticated and not body.allowed_domains:
        raise APIError(
            422, "invalid_request",
            "allowed_domains is required when storage_state is supplied: a "
            "session holding live cookies must not be able to navigate "
            "off-domain")

    redis = _redis(request)
    record = await browser_sessions.create(
        redis, owner_id=principal.owner_id, user_id=principal.user.id,
        allowed_domains=body.allowed_domains, authenticated=authenticated,
        idle_ttl=body.idle_ttl, max_sessions=principal.max_sessions)

    payload = {"session": record.id}
    if body.storage_state:
        payload["storage_state"] = body.storage_state
    if record.allowed_domains:
        # Defence in depth: the backend checks every navigation it forwards,
        # and the browser service refuses off-domain ones itself.
        payload["allowed_domains"] = record.allowed_domains
    try:
        await vivid_tools.call("/browse/session", payload)
    except APIError:
        # Never leave a registry entry pointing at a session that failed to
        # open — it would count against the quota forever.
        await browser_sessions.close(redis, record.id, principal.owner_id)
        raise

    log.info("browser session %s opened owner=%s authenticated=%s domains=%s",
             record.id, principal.owner_id, authenticated, record.allowed_domains)
    return SessionOut(**record.public())


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(request: Request,
                        principal: Principal = Depends(get_principal)):
    records = await browser_sessions.list_for_owner(_redis(request),
                                                    principal.owner_id)
    return [SessionOut(**r.public()) for r in records]


@router.delete("/sessions/{session_id}", status_code=204)
async def close_session(session_id: str, request: Request,
                        principal: Principal = Depends(get_principal)):
    """Idempotent: closing an already-reaped session is not an error, because
    a client cleaning up in a `finally` must not fail for tidying twice."""
    redis = _redis(request)
    try:
        await browser_sessions.get(redis, session_id, principal.owner_id)
    except APIError as e:
        if e.code != "session_expired":
            raise
        return
    try:
        await vivid_tools.call("/browse/close", {"session": session_id}, 15)
    except APIError as e:
        log.warning("browser service could not close %s: %s", session_id, e.message)
    await browser_sessions.close(redis, session_id, principal.owner_id)


# ------------------------------------------------------------------- driving
@router.post("/sessions/{session_id}/goto", response_model=NavOut)
async def goto(session_id: str, body: GotoRequest, request: Request,
               principal: Principal = Depends(get_principal)):
    if not body.url.startswith(("http://", "https://")):
        raise APIError(422, "invalid_request", "url must be http(s)")
    driver = await _driver(request, session_id, principal)
    data = await driver.goto(body.url)
    return NavOut(url=data.get("url") or body.url, title=data.get("title") or "")


@router.post("/sessions/{session_id}/snapshot", response_model=SnapshotOut)
async def snapshot(session_id: str, request: Request,
                   principal: Principal = Depends(get_principal)):
    """The page as the agent sees it. Every snapshot renumbers the element
    refs, so the returned `snapshot_id` is what makes a later act provably
    current."""
    driver = await _driver(request, session_id, principal)
    data = await driver.snapshot()
    elements = [
        {"ref": i, "tag": e.get("tag", ""), "type": e.get("type") or "",
         "label": e.get("label", "")}
        for i, e in enumerate(data.get("elements") or [])]
    return SnapshotOut(snapshot_id=data["snapshot_id"], url=data.get("url") or "",
                       title=data.get("title") or "", text=data.get("text") or "",
                       headings=list(data.get("headings") or []),
                       elements=elements, snapshot=data.get("snapshot") or "")


@router.post("/sessions/{session_id}/text", response_model=TextOut)
async def read_text(session_id: str, body: TextRequest, request: Request,
                    principal: Principal = Depends(get_principal)):
    # Resolving the driver is what proves this caller owns the session; the
    # read itself needs nothing else from it.
    await _driver(request, session_id, principal)
    data = await vivid_tools.call("/browse/text",
                                  {"session": session_id,
                                   "selector": body.selector}, 30)
    return TextOut(text=data.get("text") or "", url=data.get("url") or "")


@router.post("/sessions/{session_id}/act", response_model=ActOut)
async def act(session_id: str, body: ActRequest, request: Request,
              principal: Principal = Depends(get_principal)):
    """Click, type or submit.

    Set `secret: true` when `value` is a credential — the browser service then
    marks the field so its value never appears in a later snapshot. Nothing in
    this path logs the value either way.
    """
    driver = await _driver(request, session_id, principal)
    data = await driver.act(body.ref, body.action, body.value,
                            secret=body.secret, snapshot_id=body.snapshot_id)
    log.info("act session=%s action=%s ref=%s secret=%s",
             session_id, body.action, body.ref, body.secret)
    return ActOut(did=data.get("did") or body.action, url=data.get("url") or "")


@router.get("/sessions/{session_id}/storage_state",
            response_model=StorageStateOut)
async def storage_state(session_id: str, request: Request,
                        principal: Principal = Depends(get_principal)):
    """Cookies and local storage, to replay into a later session. The response
    is a bearer credential — treat it like one."""
    driver = await _driver(request, session_id, principal)
    return StorageStateOut(storage_state=await driver.storage_state())


# --------------------------------------------------------------------- tasks
async def _run_task(driver, goal: str, max_steps: int,
                    domains: list[str]) -> AsyncIterator[tuple[str, dict]]:
    async for event in browsing.run(driver, goal=goal, max_steps=max_steps,
                                    allowed_domains=domains):
        if isinstance(event, browsing.Outcome):
            yield "result", event.as_event()
        else:
            yield "step", event.as_event()


def _sse(name: str, payload: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(payload)}\n\n"


@router.post("/tasks")
async def run_task(body: TaskRequest, request: Request,
                   principal: Principal = Depends(get_principal)):
    """Let Vivid drive: snapshot, decide, act, repeat, until it can answer.

    With `stream: true` the response is server-sent events — a `step` per
    action, then one `result`. Without it, one JSON body at the end.

    Pass `session_id` to run inside a session you authenticated yourself;
    otherwise a throwaway session is opened and closed for you.
    """
    _require_service()
    redis = _redis(request)
    max_steps = browsing.max_steps_for(body.max_steps)

    owned_session = body.session_id is not None
    if owned_session:
        record = await browser_sessions.get(redis, body.session_id,
                                            principal.owner_id)
    else:
        if not body.url:
            raise APIError(422, "invalid_request",
                           "url is required when no session_id is given")
        record = await browser_sessions.create(
            redis, owner_id=principal.owner_id, user_id=principal.user.id,
            allowed_domains=body.allowed_domains, authenticated=False,
            idle_ttl=None, max_sessions=principal.max_sessions)
        try:
            payload = {"session": record.id}
            if record.allowed_domains:
                payload["allowed_domains"] = record.allowed_domains
            await vivid_tools.call("/browse/session", payload)
        except APIError:
            await browser_sessions.close(redis, record.id, principal.owner_id)
            raise

    driver = browsing.SessionDriver(redis, record)
    if body.url:
        await driver.goto(body.url)

    async def cleanup() -> None:
        # Only sessions this request created are torn down. One the caller
        # opened stays open — they may still be logged into it.
        if owned_session:
            return
        try:
            await vivid_tools.call("/browse/close", {"session": record.id}, 15)
        except APIError:
            pass
        await browser_sessions.close(redis, record.id, principal.owner_id)

    if not body.stream:
        try:
            result: dict = {}
            async for name, payload in _run_task(driver, body.goal, max_steps,
                                                 record.allowed_domains):
                if name == "result":
                    result = payload
            return TaskResultOut(**result)
        finally:
            await cleanup()

    async def stream() -> AsyncIterator[str]:
        try:
            async for name, payload in _run_task(driver, body.goal, max_steps,
                                                 record.allowed_domains):
                yield _sse(name, payload)
        except APIError as e:
            # The stream has already started with a 200, so an error cannot be
            # a status code any more — it has to be an event.
            yield _sse("error", {"code": e.code, "message": e.message})
        except Exception as e:
            log.exception("browsing task failed")
            yield _sse("error", {"code": "internal_error",
                                 "message": f"{type(e).__name__}"})
        finally:
            await cleanup()
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
