"""Adapter for the LLM on RunPod (vLLM, OpenAI-compatible). The rest of the
backend never sees the raw protocol — it consumes token events from here."""
import json

import httpx

from app.core.config import settings
from app.services.models_gateway import http


class LLMUnavailable(Exception):
    pass


def _base() -> str:
    if not settings.LLM_BASE_URL:
        raise LLMUnavailable("LLM_BASE_URL is not configured")
    return settings.LLM_BASE_URL.rstrip("/")


async def stream_chat(messages: list[dict], max_tokens: int):
    """Yields {"type": "token", "text": ...} per token, then one
    {"type": "usage", "usage": {...} | None} at the end."""
    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": settings.LLM_TEMPERATURE,
        "top_p": settings.LLM_TOP_P,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    usage = None
    try:
        async with http.client().stream(
                "POST", f"{_base()}/chat/completions", json=payload) as r:
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
                if chunk.get("usage"):
                    usage = chunk["usage"]
                choices = chunk.get("choices") or []
                if choices:
                    tok = (choices[0].get("delta") or {}).get("content")
                    if tok:
                        yield {"type": "token", "text": tok}
    except (httpx.HTTPError, json.JSONDecodeError) as e:
        raise LLMUnavailable(f"LLM request failed: {e}") from e
    yield {"type": "usage", "usage": usage}


async def complete(messages: list[dict], max_tokens: int = 256,
                   temperature: float | None = None) -> str:
    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": settings.LLM_TEMPERATURE if temperature is None else temperature,
        "top_p": settings.LLM_TOP_P,
    }
    try:
        r = await http.client().post(f"{_base()}/chat/completions", json=payload)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    except httpx.HTTPError as e:
        raise LLMUnavailable(f"LLM request failed: {e}") from e
