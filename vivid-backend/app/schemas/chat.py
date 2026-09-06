from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.models_gateway.catalog import CHAT_MODEL_ID


class ChatCreate(BaseModel):
    language: str = "en"
    title: str | None = Field(default=None, max_length=200)


class ChatUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    pinned: bool | None = None


class ChatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None
    language: str
    client_id: str
    pinned: bool = False
    created_at: datetime
    updated_at: datetime


class ArtifactOut(BaseModel):
    """A file Vivid generated for the user, with where it came from."""
    id: str
    kind: str
    filename: str | None
    mime: str
    size_bytes: int
    url: str
    chat_id: str
    chat_title: str | None
    message_id: str | None
    created_at: datetime


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    filename: str | None
    mime: str
    size_bytes: int
    created_at: datetime
    url: str | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chat_id: str
    role: str
    content: str
    model: str | None
    tokens_in: int | None
    tokens_out: int | None
    latency_ms: int | None
    used_tools: bool = False
    created_at: datetime
    attachments: list[AttachmentOut] = []

    @field_validator("model")
    @classmethod
    def _public_alias(cls, value: str | None) -> str | None:
        """The row records which vendor model answered (analytics, and it
        changes when the provider switch flips); a client only ever sees
        Vivid's own name for the assistant."""
        return CHAT_MODEL_ID if value else value


class SearchResult(BaseModel):
    chat_id: str
    title: str | None
    language: str
    message_id: str
    role: str
    snippet: str
    score: float
    source: str  # "vector" | "text"


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
