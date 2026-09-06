
"""Image and video generation through OpenRouter.

The pods make text and speech; pictures and clips come from OpenRouter's
/images and /videos endpoints, and only from there (provider.py pins the
IMAGE and VIDEO roles to it). Both return bytes plus a mime type and nothing
else: the tool that called puts the bytes on the reply as an attachment, and
the model is told the file is attached. Image data never goes through the
model, which is how a base64 blob ends up streamed into a chat as text.

Video is asynchronous on OpenRouter: submit, poll, download. A clip takes
minutes, so the poll reports progress through the tool's status callback and
gives up at OPENROUTER_VIDEO_TIMEOUT rather than holding the user's
generation slot indefinitely.
"""
import asyncio
import base64
import logging
import time
from typing import Awaitable, Callable

import httpx

from app.core.config import settings
from app.services.models_gateway import http, provider

log = logging.getLogger("vivid.media")

#: Aspect ratios both endpoints accept; anything else is left to the model's
#: default rather than turned into a 400.
ASPECT_RATIOS = frozenset({"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"})

_VIDEO_DONE = "completed"
_VIDEO_DEAD = frozenset({"failed", "cancelled", "expired"})

# Patched in tests so a poll loop does not actually wait.
_sleep = asyncio.sleep


class MediaUnavailable(provider.UpstreamError):
    public = "Image and video generation is unavailable right now. Please try again later."


def image_available() -> bool:
    return provider.endpoint(provider.IMAGE).configured


def video_available() -> bool:
    return provider.endpoint(provider.VIDEO).configured


def _describe(e: Exception) -> str:
    return str(e) or e.__class__.__name__


def _error_text(r: httpx.Response) -> str:
    try:
        error = r.json().get("error")
    except ValueError:
        return r.text[:300]
    if isinstance(error, dict) and error.get("message"):
        return str(error["message"])
    return str(error or r.text[:300])


async def generate_image(prompt: str, aspect_ratio: str = "1:1") -> tuple[bytes, str]:
    """One picture for `prompt`. Returns (bytes, mime)."""
    ep = provider.endpoint(provider.IMAGE)
    if not ep.configured:
        raise MediaUnavailable(ep.missing)
    payload = {
        "model": ep.model,
        "prompt": prompt,
        "n": 1,
        "output_format": "png",
        "resolution": settings.OPENROUTER_IMAGE_RESOLUTION,
    }
    if aspect_ratio in ASPECT_RATIOS:
        payload["aspect_ratio"] = aspect_ratio
    try:
        r = await http.client().post(ep.url("/images"), json=payload,
                                     headers=ep.headers,
                                     timeout=settings.OPENROUTER_IMAGE_TIMEOUT)
    except httpx.HTTPError as e:
        raise MediaUnavailable(f"image generation failed: {_describe(e)}") from e
    if r.status_code >= 400:
        raise MediaUnavailable(
            f"image generation returned {r.status_code}: {_error_text(r)}")
    try:
        item = (r.json().get("data") or [{}])[0]
    except ValueError as e:
        raise MediaUnavailable(f"image generation returned unreadable JSON: {e}") from e
    encoded = item.get("b64_json")
    if not encoded:
        raise MediaUnavailable("image generation returned no image")
    return base64.b64decode(encoded), item.get("media_type") or "image/png"


async def generate_video(prompt: str, seconds: int | None = None,
                         aspect_ratio: str = "16:9",
                         on_status: Callable[[str], Awaitable[None]] | None = None,
                         ) -> tuple[bytes, str]:
    """One clip for `prompt`, waited for. Returns (bytes, mime)."""
    ep = provider.endpoint(provider.VIDEO)
    if not ep.configured:
        raise MediaUnavailable(ep.missing)
    ceiling = settings.OPENROUTER_VIDEO_MAX_SECONDS
    payload = {
        "model": ep.model,
        "prompt": prompt,
        "duration": min(max(int(seconds or ceiling), 1), ceiling),
    }
    if aspect_ratio in ASPECT_RATIOS:
        payload["aspect_ratio"] = aspect_ratio

    try:
        r = await http.client().post(ep.url("/videos"), json=payload,
                                     headers=ep.headers, timeout=60)
    except httpx.HTTPError as e:
        raise MediaUnavailable(f"video submit failed: {_describe(e)}") from e
    if r.status_code >= 400:
        raise MediaUnavailable(f"video submit returned {r.status_code}: {_error_text(r)}")
    job = r.json()
    job_id = job.get("id")
    if not job_id:
        raise MediaUnavailable("video submit returned no job id")

    started = time.monotonic()
    status = job.get("status")
    while status != _VIDEO_DONE:
        if status in _VIDEO_DEAD:
            raise MediaUnavailable(
                f"video job {job_id} {status}: {job.get('error') or 'no reason given'}")
        elapsed = int(time.monotonic() - started)
        if elapsed >= settings.OPENROUTER_VIDEO_TIMEOUT:
            raise MediaUnavailable(
                f"video job {job_id} still {status} after {elapsed}s; gave up")
        if on_status is not None:
            await on_status(f"Rendering the video… {elapsed}s")
        await _sleep(settings.OPENROUTER_VIDEO_POLL_SECONDS)
        try:
            r = await http.client().get(ep.url(f"/videos/{job_id}"),
                                        headers=ep.headers, timeout=30)
        except httpx.HTTPError as e:
            raise MediaUnavailable(f"video poll failed: {_describe(e)}") from e
        if r.status_code >= 400:
            raise MediaUnavailable(f"video poll returned {r.status_code}: {_error_text(r)}")
        job = r.json()
        status = job.get("status")

    try:
        r = await http.client().get(ep.url(f"/videos/{job_id}/content"),
                                    headers=ep.headers, timeout=120)
    except httpx.HTTPError as e:
        raise MediaUnavailable(f"video download failed: {_describe(e)}") from e
    if r.status_code >= 400 or not r.content:
        raise MediaUnavailable(
            f"video download returned {r.status_code}: {_error_text(r)}")
    cost = (job.get("usage") or {}).get("cost")
    log.info("video %s rendered in %ds, cost %s", job_id,
             int(time.monotonic() - started), cost)
    mime = r.headers.get("content-type", "").split(";")[0].strip() or "video/mp4"
    return r.content, mime if mime.startswith("video/") else "video/mp4"
