"""Image and video generation: OpenRouter-only roles, the adapter's wire
shape, and the tools that hand the result to the reply as an attachment
instead of to the model as text."""
import base64
import json

import httpx
import pytest

from app.core.config import settings
from app.services import tools
from app.services.chat_pipeline import _attachment_kind
from app.services.models_gateway import http, media, provider


@pytest.fixture(autouse=True)
def account(monkeypatch):
    monkeypatch.setattr(settings, "MODEL_PROVIDER", "runpod")
    for override in ("LLM_PROVIDER", "CODE_LLM_PROVIDER", "ASR_PROVIDER", "TTS_PROVIDER"):
        monkeypatch.setattr(settings, override, "")
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setattr(settings, "OPENROUTER_BASE_URL", "https://openrouter.test/api/v1")
    monkeypatch.setattr(settings, "OPENROUTER_IMAGE_MODEL", "black-forest-labs/flux.2-klein-4b")
    monkeypatch.setattr(settings, "OPENROUTER_IMAGE_RESOLUTION", "1K")
    monkeypatch.setattr(settings, "OPENROUTER_VIDEO_MODEL", "google/veo-3.1-fast")
    monkeypatch.setattr(settings, "OPENROUTER_VIDEO_MAX_SECONDS", 6)
    monkeypatch.setattr(settings, "OPENROUTER_VIDEO_DURATIONS", [4, 6, 8])
    monkeypatch.setattr(settings, "OPENROUTER_VIDEO_POLL_SECONDS", 0)
    monkeypatch.setattr(settings, "OPENROUTER_VIDEO_TIMEOUT", 300)


@pytest.fixture
def upstream(monkeypatch):
    seen: list[dict] = []
    replies: list[httpx.Response] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append({"method": request.method, "url": str(request.url),
                     "headers": dict(request.headers),
                     "json": json.loads(request.content) if request.content else None})
        return replies.pop(0) if replies else httpx.Response(500)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(http, "client", lambda: client)

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(media, "_sleep", no_sleep)

    class Upstream:
        requests = seen

        @staticmethod
        def reply(response: httpx.Response) -> None:
            replies.append(response)

    return Upstream


PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32


# --------------------------------------------------------------------- roles
def test_media_roles_ignore_the_switch():
    """The pods make text and speech, never pictures. MODEL_PROVIDER=runpod
    still sends images and video to OpenRouter."""
    assert provider.provider_for(provider.IMAGE) == "openrouter"
    assert provider.endpoint(provider.VIDEO).url("/videos") == "https://openrouter.test/api/v1/videos"
    assert media.image_available() and media.video_available()
    assert "generate_image" in tools.available()
    assert "generate_video" in tools.available()


def test_without_a_key_the_tools_do_not_exist(monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")
    assert not media.image_available()
    assert "generate_image" not in tools.available()
    assert "generate_video" not in tools.available()


# -------------------------------------------------------------------- images
async def test_generate_image_posts_the_prompt_and_returns_bytes(upstream):
    upstream.reply(httpx.Response(200, json={
        "data": [{"b64_json": base64.b64encode(PNG).decode(), "media_type": "image/png"}],
        "usage": {"cost": 0.003}}))
    data, mime = await media.generate_image("a blue cat", "16:9")
    assert (data, mime) == (PNG, "image/png")
    sent = upstream.requests[-1]
    assert sent["url"] == "https://openrouter.test/api/v1/images"
    assert sent["headers"]["authorization"] == "Bearer sk-or-test"
    assert sent["json"] == {"model": "black-forest-labs/flux.2-klein-4b", "prompt": "a blue cat",
                            "n": 1, "output_format": "png", "resolution": "1K",
                            "aspect_ratio": "16:9"}


async def test_an_unknown_aspect_ratio_is_left_to_the_model(upstream):
    upstream.reply(httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(PNG).decode()}]}))
    await media.generate_image("a cat", "banner")
    assert "aspect_ratio" not in upstream.requests[-1]["json"]


async def test_image_failures_keep_their_reason_for_the_log_only(upstream):
    upstream.reply(httpx.Response(402, json={"error": {
        "message": "Insufficient credits. Add more using https://openrouter.ai/settings/credits"}}))
    with pytest.raises(media.MediaUnavailable) as e:
        await media.generate_image("a cat")
    assert "402" in str(e.value) and "Insufficient credits" in str(e.value)
    assert "openrouter" not in e.value.public.lower()
    assert "credits" not in e.value.public.lower()


# --------------------------------------------------------------------- video
async def test_generate_video_submits_polls_and_downloads(upstream):
    upstream.reply(httpx.Response(202, json={"id": "job-1", "status": "pending"}))
    upstream.reply(httpx.Response(200, json={"id": "job-1", "status": "in_progress"}))
    upstream.reply(httpx.Response(200, json={"id": "job-1", "status": "completed",
                                             "usage": {"cost": 0.5}}))
    upstream.reply(httpx.Response(200, content=b"MP4BYTES",
                                  headers={"content-type": "video/mp4"}))
    progress: list[str] = []

    async def status(text):
        progress.append(text)

    data, mime = await media.generate_video("a cat running", seconds=9, on_status=status)
    assert (data, mime) == (b"MP4BYTES", "video/mp4")
    assert [r["method"] + " " + r["url"].rsplit("/api/v1", 1)[1] for r in upstream.requests] == [
        "POST /videos", "GET /videos/job-1", "GET /videos/job-1", "GET /videos/job-1/content"]
    # Nine seconds asked, ceiling is 6, and durations are a discrete set —
    # so 6, not 9 and not some in-between value the model would reject.
    assert upstream.requests[0]["json"] == {"model": "google/veo-3.1-fast",
                                            "prompt": "a cat running", "duration": 6,
                                            "aspect_ratio": "16:9"}
    assert len(progress) == 2 and progress[0].startswith("Rendering the video")


async def test_a_failed_video_job_says_so(upstream):
    upstream.reply(httpx.Response(202, json={"id": "job-2", "status": "pending"}))
    upstream.reply(httpx.Response(200, json={"id": "job-2", "status": "failed",
                                             "error": "content policy"}))
    with pytest.raises(media.MediaUnavailable, match="job-2 failed: content policy"):
        await media.generate_video("something")


async def test_a_stuck_video_job_is_given_up_on(upstream, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_VIDEO_TIMEOUT", 0)
    upstream.reply(httpx.Response(202, json={"id": "job-3", "status": "pending"}))
    with pytest.raises(media.MediaUnavailable, match="gave up"):
        await media.generate_video("something")


# --------------------------------------------------------------------- tools
async def test_the_image_tool_attaches_the_picture_and_tells_the_model_only_that(upstream):
    upstream.reply(httpx.Response(200, json={
        "data": [{"b64_json": base64.b64encode(PNG).decode(), "media_type": "image/png"}]}))
    ctx = tools.ToolContext(chat_id="c1")
    observation = await tools.run("generate_image", {"prompt": "a blue cat"}, ctx)
    assert ctx.outputs == [{"name": "vivid-image-1.png", "mime": "image/png", "data": PNG}]
    assert "attached" in observation.lower()
    assert base64.b64encode(PNG).decode()[:16] not in observation
    assert "http" not in observation


async def test_the_video_tool_attaches_the_clip(upstream):
    upstream.reply(httpx.Response(202, json={"id": "job-9", "status": "completed"}))
    upstream.reply(httpx.Response(200, content=b"MP4", headers={"content-type": "video/mp4"}))
    ctx = tools.ToolContext(chat_id="c1")
    observation = await tools.run("generate_video", {"prompt": "waves", "seconds": 3}, ctx)
    assert ctx.outputs == [{"name": "vivid-video-1.mp4", "mime": "video/mp4", "data": b"MP4"}]
    assert "attached" in observation.lower()


async def test_tool_failures_reach_the_model_as_the_public_line(upstream):
    """The observation goes into the model's prompt and from there, in its
    own words, to the user. It must carry nothing about the upstream."""
    upstream.reply(httpx.Response(402, json={"error": {
        "message": "Insufficient credits. Add more using https://openrouter.ai/settings/credits"}}))
    observation = await tools.run("generate_image", {"prompt": "a cat"}, tools.ToolContext())
    assert observation.startswith("error:")
    assert "openrouter" not in observation.lower() and "credits" not in observation.lower()


async def test_the_image_tool_needs_a_prompt():
    assert (await tools.run("generate_image", {}, tools.ToolContext())).startswith("error:")


def test_tool_files_are_filed_by_kind():
    assert _attachment_kind("image/png") == "image"
    assert _attachment_kind("video/mp4") == "video"
    assert _attachment_kind("application/pdf") == "file"


@pytest.mark.parametrize("asked,sent", [
    (None, 6),   # no request -> the ceiling, which must itself be allowed
    (5, 4),      # between allowed values -> down, never an invalid in-between
    (4, 4),
    (6, 6),
    (99, 6),     # above the ceiling -> clamped to it
    (1, 4),      # below every allowed value -> the smallest that exists
])
def test_video_duration_snaps_to_an_allowed_value(upstream, asked, sent):
    """veo-3.1-fast accepts 4, 6 or 8 and 400s anything else. The old code
    sent min(max(asked,1),ceiling), so a ceiling of 5 produced 5 — a value no
    model accepts, which is why every clip failed."""
    assert media._duration(asked) == sent
    assert media._duration(asked) in settings.OPENROUTER_VIDEO_DURATIONS


async def test_image_omits_resolution_when_unset(upstream, monkeypatch):
    """Most image models declare no `resolution` parameter, and OpenRouter
    rejects the whole request for an unsupported field."""
    monkeypatch.setattr(settings, "OPENROUTER_IMAGE_RESOLUTION", "")
    upstream.reply(httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(PNG).decode()}]}))
    await media.generate_image("a cat")
    assert "resolution" not in upstream.requests[0]["json"]
