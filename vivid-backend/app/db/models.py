import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (BigInteger, Boolean, DateTime, ForeignKey, Index,
                        Integer, String, Text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import settings


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    # Display profile. For social sign-ins the account `email` is a synthetic
    # key (the provider's token carries no email); the provider's pass-through
    # name / email / picture live here as display-only data — never used for
    # lookup, since the client reports them.
    name: Mapped[str | None] = mapped_column(String(120), default=None)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), default=None)
    profile_email: Mapped[str | None] = mapped_column(String(320), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Client(Base):
    """One row per API consumer. v1 has a single row: vivid_web. The column on
    every table is the hook for B2B partners later — do not build that flow yet."""
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    system_prompt: Mapped[str | None] = mapped_column(Text, default=None)
    default_voice: Mapped[str | None] = mapped_column(String(64), default=None)
    config_json: Mapped[dict | None] = mapped_column(JSONB, default=None)


class ApiKey(Base):
    """A partner credential. Belongs to a client (which supplies the system
    prompt and tool allowlist) and to a service-account user (which owns the
    chats, attachments and browser sessions the key creates).

    Keying data to a real user row rather than making user_id nullable
    everywhere means every existing ownership check keeps working untouched —
    the alternative was a nullable FK on five tables and an `or` in every
    query.

    Two people are recorded, and they are deliberately not the same one.
    `user_id` is the service account the key acts as, so a partner's chats and
    files never appear in anyone's own sidebar. `owner_user_id` is the human
    who generated it in Settings and is the only one who may list or revoke
    it. Keys minted by the CLI before self-serve existed have no owner, which
    is why the column is nullable: nobody signed in to create them.

    Only the hash is stored. Keys are 32 bytes of urandom, so SHA-256 is the
    right primitive: bcrypt exists to slow down guessing low-entropy
    passwords, and paying its cost on every single API request would be a
    self-inflicted rate limit.
    """
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    client_id: Mapped[str] = mapped_column(
        ForeignKey("clients.id"), default=settings.DEFAULT_CLIENT_ID)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True)
    #: The human who generated this key. Null for CLI-minted partner keys.
    owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, default=None)
    name: Mapped[str] = mapped_column(String(128))
    # The visible half, for "which key is this?" without revealing the secret.
    prefix: Mapped[str] = mapped_column(String(24), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # Concurrent browser sessions this key may hold. Enforced before the
    # browser pool is asked, so one partner cannot starve the tier.
    max_sessions: Mapped[int] = mapped_column(
        Integer, default=settings.BROWSER_SESSIONS_PER_KEY)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None)


class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[str] = mapped_column(
        ForeignKey("clients.id"), default=settings.DEFAULT_CLIENT_ID)
    title: Mapped[str | None] = mapped_column(String(200), default=None)
    language: Mapped[str] = mapped_column(String(8), default="en")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    chat_id: Mapped[str] = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant | system | tool
    content: Mapped[str] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String(128), default=None)
    tokens_in: Mapped[int | None] = mapped_column(Integer, default=None)
    tokens_out: Mapped[int | None] = mapped_column(Integer, default=None)
    latency_ms: Mapped[int | None] = mapped_column(Integer, default=None)
    used_tools: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (Index("ix_messages_chat_created", "chat_id", "created_at"),)


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    message_id: Mapped[str | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL"), default=None, index=True)
    chat_id: Mapped[str | None] = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"), default=None, index=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # image | video | file | audio
    filename: Mapped[str | None] = mapped_column(String(256), default=None)
    storage_key: Mapped[str] = mapped_column(String(512))
    mime: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    extracted_text: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Connector(Base):
    """A per-user integration (GitHub, ...) whose credentials turn into
    per-user tools in the agent loop. One row per (user, provider).
    TODO: encrypt token at rest before real users arrive."""
    __tablename__ = "connectors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(128))
    token: Mapped[str] = mapped_column(String(512), default="")
    config_json: Mapped[dict | None] = mapped_column(JSONB, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (Index("ix_connectors_user_provider", "user_id",
                            "provider", unique=True),)


class ModelUsage(Base):
    """One row per completed /v1/chat/completions call through the proxy.

    This table is the whole point of making developer tools go through the
    backend: a pod hit directly serves traffic nobody can attribute, bill or
    cut off. Written after the reply finishes — including after a stream
    closes — so `completion_tokens` is the real figure rather than an estimate.

    Both credential kinds are recorded. `user_id` is always the human (a
    partner key resolves to its service account); `api_key_id` is set only when
    a key was used, which is what separates "Timi in the editor" from "Timi's
    CI job" in the same user's totals.
    """
    __tablename__ = "model_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True)
    api_key_id: Mapped[str | None] = mapped_column(
        ForeignKey("api_keys.id", ondelete="SET NULL"), default=None, index=True)
    client_id: Mapped[str] = mapped_column(String(64), default=settings.DEFAULT_CLIENT_ID)
    #: The public alias asked for (`vivid-code`), not the vendor model id — the
    #: vendor string changes when a pod is re-provisioned and would break
    #: any usage history keyed on it.
    model: Mapped[str] = mapped_column(String(64), index=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    stream: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, index=True)


class MessageEmbedding(Base):
    __tablename__ = "message_embeddings"

    message_id: Mapped[str] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.EMBEDDING_DIM))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
