"""OpenAI-compatible passthrough to a pod, on behalf of an authenticated user.

`llm.py` next door is the product's own adapter: it decides the prompt, the
temperature and the tool loop. This module decides none of those — the caller
is an agent running on someone's laptop and it has its own opinions. What this
adds over letting that agent reach the pod itself is the part the pod cannot
do: a Vivid identity on every call, a model alias instead of a vendor string,
a ceiling on one reply, and a token count that comes back for the ledger.

It also keeps the upstream to itself. A client sees `vivid-code`, an OpenAI
shaped body and, on failure, either its own mistake or "unavailable"; it does
not see which host answered, what the call cost us, or that the pods were
down and OpenRouter took the call.
"""
import json
import logging
from typing import AsyncIterator

import httpx

from app.core.config import settings
from app.services.models_gateway import http, provider
from app.services.models_gateway.catalog import Model

log = logging.getLogger("vivid.models.proxy")


class UpstreamError(Exception):
    """The pod refused or could not be reached. Carries the status so the
    route can pass a 4xx through as the client's fault rather than ours."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


#: Request fields forwarded upstream. An allowlist rather than a passthrough of
#: whatever arrived: `model` is substituted from the catalogue and must not be
#: overridable, and vLLM accepts server-shaped options (`prompt_logprobs`,
#: adapter selection) that a client has no business setting through us.
_FORWARDED = frozenset({
    "messages", "temperature", "top_p", "top_k", "n", "stop", "seed",
    "presence_penalty", "frequency_penalty", "repetition_penalty",
    "logit_bias", "logprobs", "top_logprobs", "response_format",
    "tools", "tool_choice", "parallel_tool_calls", "user",
})

#: Upstream statuses that are the client's own doing and whose message is
#: worth relaying: a malformed body, an unknown model, a prompt over the
#: context window. Anything else — 401/402/429 on OUR account, 5xx — is our
#: problem, and the client is told "unavailable" without the reason.
_CLIENT_FAULT = frozenset({400, 404, 413, 415, 422})

#: Response fields an upstream adds beyond the OpenAI shape and a client may
#: not see: OpenRouter names the host that served the call and what it cost.
_PRIVATE_TOP_LEVEL = ("provider",)
_PRIVATE_USAGE = ("cost", "cost_details", "is_byok")

_UNAVAILABLE = "the model service is unavailable right now; retry shortly"


def build_payload(body: dict, model: Model, stream: bool) -> dict:
    """The upstream request: the client's own parameters, with the model
    resolved and the reply length capped."""
    payload = {key: value for key, value in body.items()
               if key in _FORWARDED and value is not None}
    payload["model"] = model.upstream_model
    payload["stream"] = stream
    # Routing preferences are ours, not the client's: `provider` is not in
    # the allowlist above, so a client cannot steer OpenRouter through us.
    payload.update(model.endpoint.extra_payload)

    # `max_completion_tokens` is the current OpenAI spelling; vLLM still reads
    # `max_tokens`. Accept either from the client, send the one pods know.
    asked = body.get("max_tokens") or body.get("max_completion_tokens")
    ceiling = settings.MODEL_PROXY_MAX_TOKENS
    payload["max_tokens"] = min(int(asked), ceiling) if asked else ceiling

    if stream:
        # Without this the final chunk carries no usage and the ledger would
        # have to estimate the completion length from the text it saw.
        payload["stream_options"] = {"include_usage": True}
    return payload


def _url(model: Model) -> str:
    return model.endpoint.url()


def sanitize(chunk: dict) -> dict:
    """A completion (or one streamed chunk of one) with the upstream's own
    additions removed. Mutates and returns `chunk`."""
    for key in _PRIVATE_TOP_LEVEL:
        chunk.pop(key, None)
    usage = chunk.get("usage")
    if isinstance(usage, dict):
        for key in _PRIVATE_USAGE:
            usage.pop(key, None)
    return chunk


def _refusal(body: str, status: int) -> UpstreamError:
    """What to tell the client about an upstream 4xx/5xx. The detail is
    logged either way; only a client-fault message is relayed, scrubbed."""
    message = _upstream_message(body, status)
    log.warning("upstream refused (%s): %s", status, message)
    if status in _CLIENT_FAULT:
        return UpstreamError(provider.scrub(message), status=status)
    return UpstreamError(_UNAVAILABLE, status=503)


async def complete(model: Model, payload: dict) -> dict:
    """One non-streaming completion, as the upstream worded it minus what
    the upstream said about itself."""
    try:
        r = await http.client().post(_url(model), json=payload,
                                     headers=model.endpoint.headers)
    except httpx.HTTPError as e:
        log.warning("upstream unreachable: %s", str(e) or e.__class__.__name__)
        raise UpstreamError(_UNAVAILABLE, status=503) from e
    if r.status_code >= 400:
        raise _refusal(r.text, r.status_code)
    try:
        return sanitize(r.json())
    except json.JSONDecodeError as e:
        log.warning("upstream returned unreadable JSON: %s", e)
        raise UpstreamError(_UNAVAILABLE, status=502) from e


class StreamedCompletion:
    """An upstream SSE stream, passed through while the usage chunk is noted on
    its way past.

    Re-reading the body afterwards is not an option — it has already gone to
    the client — and buffering the whole reply to count tokens would undo the
    streaming. So usage is picked out in flight and left on {@link usage} for
    the caller to record once iteration ends. The same pass strips what the
    upstream says about itself from every chunk.
    """

    def __init__(self, model: Model, payload: dict):
        self._model = model
        self._payload = payload
        self.usage: dict | None = None

    async def __aiter__(self) -> AsyncIterator[bytes]:
        try:
            async with http.client().stream(
                    "POST", _url(self._model), json=self._payload,
                    headers=self._model.endpoint.headers) as r:
                if r.status_code >= 400:
                    body = (await r.aread()).decode(errors="replace")
                    raise _refusal(body, r.status_code)
                async for line in r.aiter_lines():
                    if not line:
                        continue
                    # Re-frame rather than forward raw bytes: aiter_lines has
                    # already eaten the delimiters, and one event per `data:`
                    # line is the framing every OpenAI client expects.
                    yield f"{self._pass(line)}\n\n".encode()
        except httpx.HTTPError as e:
            # Mid-stream this cannot become a status code — the response has
            # begun — so the route turns it into a terminal error event.
            log.warning("upstream stream broke: %s", str(e) or e.__class__.__name__)
            raise UpstreamError("the model stopped responding") from e

    def _pass(self, line: str) -> str:
        """One SSE line, sanitized, with its usage noted. Lines that are not
        JSON data (comments, [DONE]) go through untouched."""
        if not line.startswith("data:"):
            return line
        data = line[5:].strip()
        if not data or data == "[DONE]":
            return line
        try:
            chunk = json.loads(data)
        except json.JSONDecodeError:
            return line
        if not isinstance(chunk, dict):
            return line
        sanitize(chunk)
        if chunk.get("usage"):
            self.usage = chunk["usage"]
        return f"data: {json.dumps(chunk, separators=(',', ':'))}"


def _upstream_message(body: str, status: int) -> str:
    """The pod's own complaint, if it made one in a shape we recognise.

    A vLLM validation error ("this model's maximum context length is...") is
    the most useful thing we can hand back; only when there is nothing to
    quote do we fall back to the status code.
    """
    try:
        parsed = json.loads(body)
        error = parsed.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if isinstance(error, str) and error:
            return error
        if parsed.get("message"):
            return str(parsed["message"])
    except (json.JSONDecodeError, AttributeError):
        pass
    snippet = body.strip()[:300]
    return f"the model returned {status}" + (f": {snippet}" if snippet else "")
