from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    #: Sent upstream only when the model accepts it; anything unrecognised is
    #: left to the model's own default rather than turned into a 400.
    aspect_ratio: str = "1:1"
    #: `url` stores the image and returns a link, which is what a browser or a
    #: second service can use directly. `b64_json` returns the bytes inline for
    #: callers that do not want a second request.
    response_format: Literal["url", "b64_json"] = "url"


class GeneratedFile(BaseModel):
    """One stored file, in the shape the rest of the API already uses for
    attachments so a partner learns it once."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    filename: str | None
    mime: str
    size_bytes: int
    url: str | None = None
    b64_json: str | None = None


class ImageResponse(BaseModel):
    created: int
    data: list[GeneratedFile]


class VideoRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    #: Clip length. Video models take discrete durations, so this is snapped to
    #: one the model accepts and capped by OPENROUTER_VIDEO_MAX_SECONDS.
    seconds: int | None = Field(default=None, ge=1, le=60)
    aspect_ratio: str = "16:9"


class VideoJob(BaseModel):
    """A render in progress, or the file it produced.

    `status` is pending, completed or failed. Poll GET /videos/{id} until it
    leaves pending; the clip arrives on `video` when it does.
    """
    id: str
    status: Literal["pending", "completed", "failed"]
    prompt: str
    created_at: datetime
    video: GeneratedFile | None = None
    error: str | None = None


class SpeechRequest(BaseModel):
    input: str = Field(min_length=1, max_length=4000)
    #: en, yo, ig or pcm. Picks the engine as well as the accent.
    language: str = "en"
    voice: str | None = None
    #: `url` stores the clip and returns a link; `audio` streams the bytes back
    #: as the response body, which is what the OpenAI client expects.
    response_format: Literal["url", "audio"] = "audio"


class TranscriptionResponse(BaseModel):
    text: str
    #: What the transcriber decided it heard, which is the answer when the
    #: request asked for "auto".
    language: str
