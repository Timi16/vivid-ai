from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatCreate(BaseModel):
    language: str = "en"
    title: str | None = Field(default=None, max_length=200)


class ChatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None
    language: str
    client_id: str
    created_at: datetime
    updated_at: datetime


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
    created_at: datetime
    attachments: list[AttachmentOut] = []


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
