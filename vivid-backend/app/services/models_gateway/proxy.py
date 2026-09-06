"""OpenAI-compatible passthrough to a pod, on behalf of an authenticated user.

`llm.py` next door is the product's own adapter: it decides the prompt, the
temperature and the tool loop. This module decides none of those — the caller
is an agent running on someone's laptop and it has its own opinions. What this
adds over letting that agent reach the pod itself is the part the pod cannot
do: a Vivid identity on every call, a model alias instead of a vendor string,
a ceiling on one reply, and a token count that comes back for the ledger.
"""
import json
from typing import AsyncIterator

import httpx

from app.core.config import settings
from app.services.models_gateway import http
from app.services.models_gateway.catalog import Model


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


async def complete(model: Model, payload: dict) -> dict:
    """One non-streaming completion, returned as the pod worded it."""
    try:
        r = await http.client().post(_url(model), json=payload,
                                     headers=model.endpoint.headers)
    except httpx.HTTPError as e:
        raise UpstreamError(f"the model could not be reached: {e}") from e
    if r.status_code >= 400:
        raise UpstreamError(_upstream_message(r.text, r.status_code),
                            status=r.status_code if r.status_code < 500 else 502)
    try:
        return r.json()
    except json.JSONDecodeError as e:
        raise UpstreamError(f"the model returned an unreadable response: {e}") from e


class StreamedCompletion:
    """An upstream SSE stream, passed through while the usage chunk is noted on
    its way past.

    Re-reading the body afterwards is not an option — it has already gone to
    the client — and buffering the whole reply to count tokens would undo the
    streaming. So usage is picked out in flight and left on {@link usage} for
    the caller to record once iteration ends.
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
                    raise UpstreamError(
                        _upstream_message(body, r.status_code),
                        status=r.status_code if r.status_code < 500 else 502)
                async for line in r.aiter_lines():
                    if not line:
                        continue
                    self._note_usage(line)
                    # Re-frame rather than forward raw bytes: aiter_lines has
                    # already eaten the delimiters, and one event per `data:`
                    # line is the framing every OpenAI client expects.
                    yield f"{line}\n\n".encode()
        except httpx.HTTPError as e:
            # Mid-stream this cannot become a status code — the response has
            # begun — so the route turns it into a terminal error event.
            raise UpstreamError(f"the model stopped responding: {e}") from e

    def _note_usage(self, line: str) -> None:
        if not line.startswith("data:"):
            return
        data = line[5:].strip()
        if not data or data == "[DONE]":
            return
        try:
            chunk = json.loads(data)
        except json.JSONDecodeError:
            return
        if isinstance(chunk, dict) and chunk.get("usage"):
            self.usage = chunk["usage"]


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
