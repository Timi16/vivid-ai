"""The assistant's tools, callable directly.

In a chat turn the model picks a tool and the pipeline runs it. A partner has
no model in the loop, so these expose the same registry: list what is
available, then run one with its arguments and get back the observation the
assistant itself would have been given.

Files a tool creates are stored and returned rather than discarded. run_code
writing a chart and generate_image producing a picture both land in `files`,
the same shape the media endpoints use.
"""
import logging
import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, get_principal
from app.core.config import settings
from app.core.errors import APIError
from app.db.models import Attachment
from app.schemas.media import GeneratedFile
from app.schemas.tools import ToolOut, ToolRunRequest, ToolRunResponse
from app.services import rate_limit, storage
from app.services import tools as tools_svc

router = APIRouter(prefix="/tools", tags=["tools"])
log = logging.getLogger("vivid.tools.api")


async def _limit(request: Request, principal: Principal) -> None:
    redis = getattr(request.app.state, "redis", None)
    if redis is None:
        return
    allowed = await rate_limit.check_bucket(
        redis, f"tool:{principal.owner_id}", settings.TOOL_RATE_LIMIT_PER_MINUTE)
    if not allowed:
        raise APIError(429, "rate_limited",
                       "Too many tool calls; slow down and retry shortly.")


@router.get("", response_model=list[ToolOut])
async def list_tools(principal: Principal = Depends(get_principal)):
    """Tools this deployment can run right now.

    The list is shorter when a service is unconfigured: no Tavily key means no
    web search, no OpenRouter key means no image generation. Read it rather
    than hard-coding names, because that is what a caller can rely on.
    """
    return [ToolOut(name=name, description=tool.desc, arguments=tool.args)
            for name, tool in sorted(tools_svc.available().items())]


@router.post("/{name}", response_model=ToolRunResponse)
async def run_tool(name: str, body: ToolRunRequest, request: Request,
                   principal: Principal = Depends(get_principal),
                   db: AsyncSession = Depends(get_db)):
    """Run one tool and return what it observed.

    A tool that fails returns its complaint as `result` with a 200, exactly as
    the assistant would receive it: "the city was not found" is an answer, not
    a transport error, and a caller loop wants to read it rather than catch it.
    A tool that does not exist here is a 404, because that is the caller
    getting the name wrong.
    """
    await _limit(request, principal)
    tool = tools_svc.available().get(name)
    if tool is None:
        known = ", ".join(sorted(tools_svc.available()))
        raise APIError(404, "tool_not_found",
                       f"No tool named '{name}'. This deployment runs: {known}")

    context = tools_svc.ToolContext()
    result = await tools_svc.run_tool(tool, body.arguments, context)

    files: list[GeneratedFile] = []
    for output in context.outputs[:5]:
        try:
            key = f"{principal.user.id}/api/{uuid.uuid4()}-{output['name']}"
            await storage.upload(key, output["data"], output["mime"])
            attachment = Attachment(
                user_id=principal.user.id,
                kind=("image" if output["mime"].startswith("image/")
                      else "video" if output["mime"].startswith("video/") else "file"),
                filename=output["name"], storage_key=key, mime=output["mime"],
                size_bytes=len(output["data"]))
            db.add(attachment)
            await db.commit()
            await db.refresh(attachment)
            files.append(GeneratedFile(
                id=attachment.id, kind=attachment.kind, filename=attachment.filename,
                mime=attachment.mime, size_bytes=attachment.size_bytes,
                url=storage.presigned_url(key)))
        except Exception as e:
            # The observation is still worth returning: the tool did its work,
            # and only the copy we keep of its output was lost.
            log.warning("could not store tool output %s: %s", output.get("name"), e)

    log.info("tool %s run by %s", name, principal.owner_id)
    return ToolRunResponse(tool=name, result=result, files=files)
