from fastapi import APIRouter, Depends

from ..browser import service
from ..schemas import ActRequest, GotoRequest, SessionRequest, TextRequest, ToolResponse
from ..security import is_allowed_url, require_token
from ..browser.pool import pool

router = APIRouter(prefix="/browse", tags=["browse"],
                   dependencies=[Depends(require_token)])


def _fail(msg: str) -> ToolResponse:
    return ToolResponse(ok=False, error=msg[:300])


@router.post("/goto", response_model=ToolResponse)
async def goto(req: GotoRequest):
    if not is_allowed_url(req.url):
        return _fail("blocked: only public http(s) URLs are allowed")
    try:
        return ToolResponse(data=await service.navigate(req.session, req.url))
    except Exception as e:
        return _fail(str(e))


@router.post("/snapshot", response_model=ToolResponse)
async def snapshot(req: SessionRequest):
    try:
        return ToolResponse(data=await service.snapshot(req.session))
    except Exception as e:
        return _fail(str(e))


@router.post("/text", response_model=ToolResponse)
async def text(req: TextRequest):
    try:
        return ToolResponse(data=await service.read_text(req.session, req.selector))
    except Exception as e:
        return _fail(str(e))


@router.post("/act", response_model=ToolResponse)
async def act(req: ActRequest):
    try:
        return ToolResponse(data=await service.act(req.session, req.ref,
                                                   req.action, req.value))
    except Exception as e:
        return _fail(str(e))


@router.post("/close", response_model=ToolResponse)
async def close(req: SessionRequest):
    return ToolResponse(data={"closed": await pool.close(req.session)})
