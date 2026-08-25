from fastapi import APIRouter, Depends

from ..browser import service
from ..browser.pool import CapacityExceeded, pool
from ..schemas import (ActRequest, GotoRequest, OpenSessionRequest,
                       SessionRequest, TextRequest, ToolResponse)
from ..security import is_allowed_url, require_token

router = APIRouter(prefix="/browse", tags=["browse"],
                   dependencies=[Depends(require_token)])


def _fail(msg: str) -> ToolResponse:
    return ToolResponse(ok=False, error=msg[:300])


@router.post("/session", response_model=ToolResponse)
async def open_session(req: OpenSessionRequest):
    """Create a context, optionally authenticated and domain-scoped."""
    try:
        return ToolResponse(data=await service.open_session(
            req.session, req.storage_state, req.allowed_domains))
    except CapacityExceeded as e:
        # Surfaced rather than papered over: the old behaviour was to evict
        # the least recently used session, which silently destroyed another
        # tenant's work — and an evicted authenticated session is a lost login.
        return _fail(f"capacity: {e}")
    except Exception as e:
        return _fail(str(e))


@router.post("/goto", response_model=ToolResponse)
async def goto(req: GotoRequest):
    if not is_allowed_url(req.url):
        return _fail("blocked: only public http(s) URLs are allowed")
    try:
        return ToolResponse(data=await service.navigate(req.session, req.url))
    except service.DomainNotAllowed as e:
        return _fail(f"blocked: {e}")
    except CapacityExceeded as e:
        return _fail(f"capacity: {e}")
    except Exception as e:
        return _fail(str(e))


@router.post("/snapshot", response_model=ToolResponse)
async def snapshot(req: SessionRequest):
    try:
        return ToolResponse(data=await service.snapshot(req.session))
    except KeyError:
        return _fail("session expired; open a new one")
    except Exception as e:
        return _fail(str(e))


@router.post("/text", response_model=ToolResponse)
async def text(req: TextRequest):
    try:
        return ToolResponse(data=await service.read_text(req.session, req.selector))
    except KeyError:
        return _fail("session expired; open a new one")
    except Exception as e:
        return _fail(str(e))


@router.post("/act", response_model=ToolResponse)
async def act(req: ActRequest):
    try:
        return ToolResponse(data=await service.act(req.session, req.ref,
                                                   req.action, req.value,
                                                   req.secret))
    except KeyError:
        return _fail("session expired; open a new one")
    except Exception as e:
        # req.value may be a credential, so only the exception's own text goes
        # back — never the request body.
        return _fail(str(e))


@router.post("/storage_state", response_model=ToolResponse)
async def storage_state(req: SessionRequest):
    try:
        return ToolResponse(data=await service.storage_state(req.session))
    except KeyError:
        return _fail("session expired; open a new one")
    except Exception as e:
        return _fail(str(e))


@router.post("/close", response_model=ToolResponse)
async def close(req: SessionRequest):
    return ToolResponse(data={"closed": await pool.close(req.session)})
