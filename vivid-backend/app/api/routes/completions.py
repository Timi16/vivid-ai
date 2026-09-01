"""The OpenAI-compatible surface Vivid's developer tools point at.

    GET  /v1/models
    POST /v1/chat/completions

Vivid Code, the VS Code extension and the editor used to hold a pod address and
call it with no credential at all. They call this instead. The shape is
deliberately the one every OpenAI client already speaks, so pointing a tool
here is a base-URL change rather than a rewrite — but the base URL now demands
a Vivid token, resolves a model alias to whichever pod currently serves it, and
writes what the call cost to the ledger.

This is the product's own chat surface's opposite number: /chats owns prompts,
history and the tool loop, and answers to the app. Here the caller brings its
own prompt and its own agent loop, and we own only identity and accounting.
"""
import json
import logging
from typing import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.deps import Principal, get_principal
from app.core.config import settings
from app.core.errors import APIError
from app.db.models import ModelUsage
from app.db.session import async_session
from app.services import rate_limit
from app.services.models_gateway import catalog, proxy

router = APIRouter(tags=["models"])
log = logging.getLogger("vivid.models.proxy")


def _require_enabled() -> None:
    if not settings.MODEL_PROXY_ENABLED:
        raise APIError(503, "model_proxy_disabled",
                       "the model API is not enabled on this deployment")


async def _check_rate_limit(request: Request, principal: Principal) -> None:
    redis = getattr(request.app.state, "redis", None)
    if redis is None:
        return  # limits fail open, as everywhere else
    allowed = await rate_limit.check_bucket(
        redis, f"mp:{principal.owner_id}",
        settings.MODEL_PROXY_RATE_LIMIT_PER_MINUTE)
    if not allowed:
        raise APIError(429, "rate_limited",
                       "too many model requests; slow down and retry shortly")


def _resolve(model_id: str | None) -> catalog.Model:
    try:
        return catalog.resolve(model_id)
    except catalog.UnknownModel as e:
        # 404 is what an OpenAI client expects for a model it may not have; a
        # deployment with nothing configured is our fault, not the caller's.
        status = 503 if "no models" in str(e) else 404
        raise APIError(status, "model_not_found", str(e))


async def _record(principal: Principal, model_id: str, usage: dict | None,
                  stream: bool) -> None:
    """Write one line of the ledger. Never fatal: the caller already has their
    completion, and losing an accounting row must not turn a served request
    into a failed one."""
    usage = usage or {}
    try:
        async with async_session() as db:
            db.add(ModelUsage(
                user_id=principal.user.id,
                api_key_id=principal.api_key.id if principal.api_key else None,
                client_id=principal.client_id,
                model=model_id,
                prompt_tokens=int(usage.get("prompt_tokens") or 0),
                completion_tokens=int(usage.get("completion_tokens") or 0),
                total_tokens=int(usage.get("total_tokens") or 0),
                stream=stream,
            ))
            await db.commit()
    except Exception:
        log.exception("could not record model usage for %s", principal.owner_id)


@router.get("/models")
async def list_models(principal: Principal = Depends(get_principal)):
    """The models this deployment serves, best default first.

    `max_model_len` is not part of the OpenAI response, and is included because
    a coding agent has to size its context window before it sends anything —
    without it every client would hard-code a guess.
    """
    _require_enabled()
    return {
        "object": "list",
        "data": [{
            "id": model.id,
            "object": "model",
            "owned_by": "vivid",
            "description": model.description,
            "max_model_len": model.context_tokens,
        } for model in _catalog_or_503()],
    }


def _catalog_or_503() -> list[catalog.Model]:
    models = catalog.catalog()
    if not models:
        raise APIError(503, "model_unavailable",
                       "no models are configured on this deployment")
    return models


@router.post("/chat/completions")
async def chat_completions(request: Request,
                           principal: Principal = Depends(get_principal)):
    """A chat completion, streaming or not, on the caller's own terms.

    The body is read raw rather than through a schema: this has to accept the
    whole OpenAI request shape including tool definitions, and a pydantic model
    would reject fields as soon as a client library added one.
    """
    _require_enabled()
    await _check_rate_limit(request, principal)

    body = await request.json()
    if not isinstance(body, dict):
        raise APIError(400, "bad_request", "the request body must be an object")
    if not body.get("messages"):
        raise APIError(400, "bad_request", "`messages` is required")

    model = _resolve(body.get("model"))
    stream = bool(body.get("stream"))
    payload = proxy.build_payload(body, model, stream)

    if not stream:
        try:
            result = await proxy.complete(model, payload)
        except proxy.UpstreamError as e:
            raise APIError(e.status, "model_error", str(e))
        await _record(principal, model.id, result.get("usage"), stream=False)
        # Report the alias back, not the vendor id the pod answered with: the
        # client asked for `vivid-code` and that is what it should see echoed.
        result["model"] = model.id
        return result

    return StreamingResponse(
        _stream(principal, model, payload),
        media_type="text/event-stream",
        # Streaming through a proxy that buffers is the same as not streaming.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream(principal: Principal, model: catalog.Model,
                  payload: dict) -> AsyncIterator[bytes]:
    streamed = proxy.StreamedCompletion(model, payload)
    try:
        async for chunk in streamed:
            yield chunk
    except proxy.UpstreamError as e:
        # The status line is long gone by now, so the only way to tell the
        # client is an error event in the stream it is already reading.
        log.warning("proxied stream failed for %s: %s", principal.owner_id, e)
        yield _error_event(str(e))
    finally:
        # Runs on client disconnect too, so a cancelled generation still bills
        # for the tokens the pod produced before we stopped reading.
        await _record(principal, model.id, streamed.usage, stream=True)


def _error_event(message: str) -> bytes:
    payload = json.dumps({"error": {"code": "model_error", "message": message}})
    return f"data: {payload}\n\n".encode()
