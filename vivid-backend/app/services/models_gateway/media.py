
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

#: Video models are pickier than image ones: veo-3.1-fast takes 16:9 and 9:16
#: and nothing else, so a 1:1 request that is fine for a picture 400s a clip.
#: Anything outside this is dropped rather than sent and rejected.
VIDEO_ASPECT_RATIOS = frozenset({"16:9", "9:16"})


def _duration(seconds: int | None) -> int:
    """Snap a requested length to one the model will actually accept.

    Durations are a DISCRETE set, not a range — 4, 6 or 8 for veo-3.1-fast —
    and an in-between value is rejected outright rather than rounded. Picks
    the largest allowed value at or below the request, so asking for 5 gets 4
    rather than an error.
    """
    allowed = sorted(settings.OPENROUTER_VIDEO_DURATIONS or [])
    ceiling = settings.OPENROUTER_VIDEO_MAX_SECONDS
    if not allowed:
        return ceiling
    want = min(int(seconds or ceiling), ceiling)
    usable = [d for d in allowed if d <= want]
    return usable[-1] if usable else allowed[0]


_VIDEO_DONE = "completed"
_VIDEO_DEAD = frozenset({"failed", "cancelled", "expired"})

# Patched in tests so a poll loop does not actually wait.
_sleep = asyncio.sleep


class MediaUnavailable(provider.UpstreamError):
    public = "Image and video generation is unavailable right now. Please try again later."


class MediaRejected(MediaUnavailable):
    """The upstream refused the PROMPT, not the request.

    A subclass so every existing `except MediaUnavailable` still catches it,
    but with a public message that tells the truth: "try again later" is
    actively wrong advice here, because the identical prompt will be refused
    every time. Naming a copyrighted character is the usual cause — MiniMax
    answers "input text sensitive (1026)", others word it differently, hence
    matching on several phrasings rather than one provider's code.
    """
    public = ("That description was refused by the generator. Try rewording "
              "it — descriptions naming real people, brands or copyrighted "
              "characters are usually rejected.")


#: Substrings that mean "we will never render this prompt", in the wording of
#: the several upstreams that sit behind the endpoint.
_REFUSAL = (
    "sensitive",           # MiniMax: "input text sensitive (1026)"
    "content policy",
    "content_policy",
    "moderation",
    "safety",
    "prohibited",
    "violat",              # "violates", "violation"
    "flagged",
    "not allowed",
)


def _is_refusal(reason: str) -> bool:
    low = reason.lower()
    return any(term in low for term in _REFUSAL)


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
    }
    # Only when set. OpenRouter rejects the whole request for a parameter the
    # chosen model does not declare, and most image models — including the
    # default — have no `resolution` at all.
    if settings.OPENROUTER_IMAGE_RESOLUTION:
        payload["resolution"] = settings.OPENROUTER_IMAGE_RESOLUTION
    if aspect_ratio in ASPECT_RATIOS:
        payload["aspect_ratio"] = aspect_ratio
    try:
        r = await http.client().post(ep.url("/images"), json=payload,
                                     headers=ep.headers,
                                     timeout=settings.OPENROUTER_IMAGE_TIMEOUT)
    except httpx.HTTPError as e:
        raise MediaUnavailable(f"image generation failed: {_describe(e)}") from e
    if r.status_code >= 400:
        reason = _error_text(r)
        detail = f"image generation returned {r.status_code}: {reason}"
        raise (MediaRejected if _is_refusal(reason) else MediaUnavailable)(detail)
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
    payload = {
        "model": ep.model,
        "prompt": prompt,
        "duration": _duration(seconds),
    }
    if aspect_ratio in VIDEO_ASPECT_RATIOS:
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
            reason = str(job.get("error") or "no reason given")
            detail = f"video job {job_id} {status}: {reason}"
            raise (MediaRejected if _is_refusal(reason) else MediaUnavailable)(detail)
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
