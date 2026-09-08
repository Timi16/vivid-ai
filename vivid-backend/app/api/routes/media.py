"""Generation over plain HTTP: images, video and voice.

The apps get these through the chat pipeline, where the model decides to call
a tool. A partner with an API key has no model in the loop and no websocket,
so the same three capabilities are exposed directly here. Shapes follow
OpenAI's where one exists (`/images/generations`, `/audio/speech`,
`/audio/transcriptions`), for the same reason the `/chat/completions` proxy
does: a partner should not have to learn our spelling of a solved problem.

Everything generated is stored and returned as an attachment record, the same
one the chat path writes, so a file made through the API shows up in the
Artifacts list beside the rest.

Video is the exception to "call it and wait". A clip takes minutes, which no
proxy will hold open, so `POST /videos` hands back a job id and the caller
polls. Nothing renders on our side: the upstream owns the job, and the poll
asks it, so there is no worker to run and a restart loses nothing.
"""
import base64
import logging
import time
import uuid

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Principal, get_db, get_principal
from app.core.config import settings
from app.core.errors import APIError
from app.db.models import Attachment, MediaJob
from app.schemas.media import (GeneratedFile, ImageRequest, ImageResponse,
                               SpeechRequest, TranscriptionResponse,
                               VideoJob, VideoRequest)
from app.services import rate_limit, storage
from app.services.models_gateway import media, provider, stt, tts

router = APIRouter(tags=["generation"])
log = logging.getLogger("vivid.media.api")

#: Extensions for what these endpoints produce, so a stored file has a name a
#: person can recognise in a bucket listing.
_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
        "video/mp4": "mp4", "video/webm": "webm", "audio/wav": "wav",
        "audio/mpeg": "mp3"}


async def _limit(request: Request, principal: Principal) -> None:
    """Generation costs real money per call, so it gets its own bucket rather
    than sharing the chat limit. Fails open when Redis is down, like every
    other limit here: a dead cache must not take the API with it."""
    redis = getattr(request.app.state, "redis", None)
    if redis is None:
        return
    allowed = await rate_limit.check_bucket(
        redis, f"gen:{principal.owner_id}", settings.GENERATION_RATE_LIMIT_PER_MINUTE)
    if not allowed:
        raise APIError(429, "rate_limited",
                       "Too many generation requests; slow down and retry shortly.")


async def _store(db: AsyncSession, principal: Principal, data: bytes, mime: str,
                 kind: str, stem: str) -> Attachment:
    """Put bytes in object storage and record them as an attachment.

    No chat and no message: a file made through the API belongs to the caller,
    not to a conversation, and `chat_id` is nullable for exactly this case.
    """
    ext = _EXT.get(mime, mime.split("/")[-1] or "bin")
    name = f"{stem}.{ext}"
    key = f"{principal.user.id}/api/{uuid.uuid4()}-{name}"
    await storage.upload(key, data, mime)
    attachment = Attachment(user_id=principal.user.id, kind=kind, filename=name,
                            storage_key=key, mime=mime, size_bytes=len(data))
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


def _as_file(attachment: Attachment, *, b64: bytes | None = None) -> GeneratedFile:
    return GeneratedFile(
        id=attachment.id, kind=attachment.kind, filename=attachment.filename,
        mime=attachment.mime, size_bytes=attachment.size_bytes,
        url=None if b64 is not None else storage.presigned_url(attachment.storage_key),
        b64_json=base64.b64encode(b64).decode() if b64 is not None else None)


def _fail(e: Exception) -> APIError:
    """An upstream generation failure as a status a caller can branch on.

    A refusal is the caller's prompt and stays a 400; anything else is our
    problem and is reported without naming the upstream, which is the same
    rule the rest of the API follows.
    """
    if isinstance(e, media.MediaRejected):
        return APIError(400, "prompt_rejected", provider.public_message(e))
    return APIError(503, "generation_unavailable", provider.public_message(e))


# --------------------------------------------------------------------- images
@router.post("/images/generations", response_model=ImageResponse)
async def generate_image(body: ImageRequest, request: Request,
                         principal: Principal = Depends(get_principal),
                         db: AsyncSession = Depends(get_db)):
    """One picture from a prompt. Takes seconds, so it answers directly."""
    await _limit(request, principal)
    if not media.image_available():
        raise APIError(503, "generation_unavailable",
                       "Image generation is not configured on this deployment.")
    try:
        data, mime = await media.generate_image(body.prompt, body.aspect_ratio)
    except Exception as e:
        log.warning("image generation failed for %s: %s", principal.owner_id, e)
        raise _fail(e)

    attachment = await _store(db, principal, data, mime, "image", "image")
    inline = data if body.response_format == "b64_json" else None
    return ImageResponse(created=int(time.time()), data=[_as_file(attachment, b64=inline)])


# ---------------------------------------------------------------------- video
def _job_out(job: MediaJob, attachment: Attachment | None) -> VideoJob:
    return VideoJob(id=job.id, status=job.status, prompt=job.prompt,
                    created_at=job.created_at, error=job.error,
                    video=_as_file(attachment) if attachment else None)


@router.post("/videos", response_model=VideoJob, status_code=202)
async def start_video(body: VideoRequest, request: Request,
                      principal: Principal = Depends(get_principal),
                      db: AsyncSession = Depends(get_db)):
    """Start a render and return a job id. Poll GET /videos/{id} for the clip.

    202 rather than 201: nothing exists yet, and the render may still fail.
    """
    await _limit(request, principal)
    if not media.video_available():
        raise APIError(503, "generation_unavailable",
                       "Video generation is not configured on this deployment.")
    try:
        upstream_id, status = await media.submit_video(
            body.prompt, body.seconds, body.aspect_ratio)
    except Exception as e:
        log.warning("video submit failed for %s: %s", principal.owner_id, e)
        raise _fail(e)

    job = MediaJob(user_id=principal.user.id, kind="video", status=status,
                   upstream_id=upstream_id, prompt=body.prompt)
    db.add(job)
    await db.commit()
    await db.refresh(job)
    log.info("video job %s started by %s", job.id, principal.owner_id)
    return _job_out(job, None)


@router.get("/videos/{job_id}", response_model=VideoJob)
async def video_job(job_id: str, principal: Principal = Depends(get_principal),
                    db: AsyncSession = Depends(get_db)):
    """Where a render got to, and the clip once it is done.

    The poll is what drives progress: this asks the upstream, and on the first
    call that finds it finished, downloads and stores the clip. Later polls
    return that same stored file rather than fetching it again.
    """
    job = (await db.execute(
        select(MediaJob).where(MediaJob.id == job_id,
                               MediaJob.user_id == principal.user.id)
    )).scalar_one_or_none()
    if job is None:
        raise APIError(404, "job_not_found", "No such video job on this account.")

    if job.attachment_id:
        return _job_out(job, await db.get(Attachment, job.attachment_id))
    if job.status == media.VIDEO_FAILED:
        return _job_out(job, None)

    try:
        status, reason = await media.video_status(job.upstream_id)
    except Exception as e:
        # A blip talking to the upstream is not the job failing. Report it as
        # still pending so the caller keeps polling rather than giving up on a
        # render that is still going.
        log.warning("video poll failed for job %s: %s", job.id, e)
        return _job_out(job, None)

    if status == media.VIDEO_PENDING:
        return _job_out(job, None)
    if status == media.VIDEO_FAILED:
        job.status = media.VIDEO_FAILED
        job.error = provider.scrub(reason or "The render failed.")
        await db.commit()
        return _job_out(job, None)

    try:
        data, mime = await media.download_video(job.upstream_id)
    except Exception as e:
        log.warning("video download failed for job %s: %s", job.id, e)
        return _job_out(job, None)

    attachment = await _store(db, principal, data, mime, "video", "video")
    job.status = media.VIDEO_DONE
    job.attachment_id = attachment.id
    await db.commit()
    log.info("video job %s completed for %s", job.id, principal.owner_id)
    return _job_out(job, attachment)


# ---------------------------------------------------------------------- voice
@router.post("/audio/speech")
async def speech(body: SpeechRequest, request: Request,
                 principal: Principal = Depends(get_principal),
                 db: AsyncSession = Depends(get_db)):
    """Text to speech. Returns the audio itself by default, a stored URL on
    request.

    The response model is untyped because the default is a binary body, which
    is what every OpenAI-shaped client expects to receive here.
    """
    await _limit(request, principal)
    try:
        audio = await tts.synthesize(body.input, body.language, body.voice)
    except Exception as e:
        log.warning("speech failed for %s: %s", principal.owner_id, e)
        raise _fail(e)

    if body.response_format == "audio":
        return Response(content=audio, media_type="audio/wav")
    attachment = await _store(db, principal, audio, "audio/wav", "audio", "speech")
    return _as_file(attachment)


@router.post("/audio/transcriptions", response_model=TranscriptionResponse)
async def transcription(file: UploadFile = File(...),
                        language: str = Form("auto"),
                        request: Request = None,
                        principal: Principal = Depends(get_principal)):
    """Speech to text. `language` accepts a code or "auto" to detect it."""
    await _limit(request, principal)
    audio = await file.read()
    if not audio:
        raise APIError(400, "bad_request", "The uploaded file is empty.")
    if len(audio) > settings.MAX_UPLOAD_BYTES:
        raise APIError(413, "file_too_large",
                       f"Audio must be under {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    try:
        text, detected = await stt.transcribe(
            audio, language, file.content_type or "audio/webm")
    except Exception as e:
        log.warning("transcription failed for %s: %s", principal.owner_id, e)
        raise _fail(e)
    return TranscriptionResponse(text=text, language=detected)
