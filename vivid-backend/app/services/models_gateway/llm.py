"""Adapter for the assistant's LLM (OpenAI-compatible chat completions). The
rest of the backend never sees the raw protocol — it consumes token events
from here.

Whether the request goes to our vLLM pod or to OpenRouter is decided by
provider.py; this module only knows it is talking OpenAI to *somewhere*."""
import asyncio
import json

import httpx

from app.core.config import settings
from app.services.models_gateway import http, provider


class LLMUnavailable(Exception):
    pass


# One retry after a short pause: Docker's DNS forwarder and the RunPod proxy
# both produce the occasional one-off connect failure ("No address associated
# with hostname", "Server disconnected"), and a single failed lookup was
# downgrading whole turns (vision -> text-only, planner -> no tools).
_TRANSIENT = (httpx.ConnectError, httpx.ConnectTimeout,
              httpx.RemoteProtocolError)
_RETRY_DELAY = 0.5


def _endpoint() -> provider.Endpoint:
    ep = provider.endpoint(provider.CHAT)
    if not ep.configured:
        raise LLMUnavailable(ep.missing)
    return ep


def model_name() -> str:
    """The vendor id currently answering chat turns, for the message row."""
    return provider.endpoint(provider.CHAT).model


def context_tokens() -> int:
    """The window the live assistant model serves. History is budgeted
    against this in prompt.build_messages: the backend owns the
    conversation, the upstream only dictates how much of it fits."""
    return provider.endpoint(provider.CHAT).context_tokens


def _stream_error(chunk: dict) -> str | None:
    """OpenRouter reports a mid-stream failure (provider fell over, credits
    ran out) as a 200 whose body carries {"error": {...}} instead of choices.
    vLLM never does this, but a silent empty reply is the wrong outcome for
    either, so both adapters look."""
    error = chunk.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error)
    if isinstance(error, str) and error:
        return error
    return None


async def stream_chat(messages: list[dict], max_tokens: int):
    """Yields {"type": "token", "text": ...} per token, then one
    {"type": "usage", "usage": {...} | None} at the end."""
    ep = _endpoint()
    payload = {
        "model": ep.model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": settings.LLM_TEMPERATURE,
        "top_p": settings.LLM_TOP_P,
        "stream": True,
        "stream_options": {"include_usage": True},
        **ep.extra_payload,
    }
    usage = None
    finish_reason = None
    yielded = False
    for attempt in (1, 2):
        try:
            async with http.client().stream(
                    "POST", ep.url(), json=payload, headers=ep.headers) as r:
                if r.status_code >= 400:
                    body = (await r.aread()).decode(errors="replace")[:500]
                    raise LLMUnavailable(f"LLM returned {r.status_code}: {body}")
                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    chunk = json.loads(data)
                    if (problem := _stream_error(chunk)):
                        raise LLMUnavailable(f"LLM stream failed: {problem}")
                    if chunk.get("usage"):
                        usage = chunk["usage"]
                    choices = chunk.get("choices") or []
                    if choices:
                        if choices[0].get("finish_reason"):
                            finish_reason = choices[0]["finish_reason"]
                        tok = (choices[0].get("delta") or {}).get("content")
                        if tok:
                            yielded = True
                            yield {"type": "token", "text": tok}
            break
        except _TRANSIENT as e:
            # Safe to retry only while nothing has streamed out yet.
            if yielded or attempt == 2:
                raise LLMUnavailable(f"LLM request failed: {e}") from e
            await asyncio.sleep(_RETRY_DELAY)
        except (httpx.HTTPError, json.JSONDecodeError) as e:
            raise LLMUnavailable(f"LLM request failed: {e}") from e
    yield {"type": "usage", "usage": usage, "finish_reason": finish_reason}


async def complete(messages: list[dict], max_tokens: int = 256,
                   temperature: float | None = None) -> str:
    ep = _endpoint()
    payload = {
        "model": ep.model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": settings.LLM_TEMPERATURE if temperature is None else temperature,
        "top_p": settings.LLM_TOP_P,
        **ep.extra_payload,
    }
    for attempt in (1, 2):
        try:
            r = await http.client().post(ep.url(), json=payload, headers=ep.headers)
            r.raise_for_status()
            body = r.json()
            if (problem := _stream_error(body)):
                raise LLMUnavailable(f"LLM request failed: {problem}")
            return body["choices"][0]["message"]["content"].strip()
        except _TRANSIENT as e:
            if attempt == 2:
                raise LLMUnavailable(f"LLM request failed: {e}") from e
            await asyncio.sleep(_RETRY_DELAY)
        except httpx.HTTPError as e:
            raise LLMUnavailable(f"LLM request failed: {e}") from e
