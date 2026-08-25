"""Attachments, artifacts, search and health.

Small surfaces that map one-for-one onto existing endpoints.
"""
from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Any

from .._transport import AsyncTransport, Transport
from ..types import Artifact, Attachment

#: The backend rejects anything larger; checking here saves the upload.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

FileInput = "str | os.PathLike[str] | bytes | BinaryIO"


def _read_file(file: Any, filename: str | None,
               mime: str | None) -> tuple[str, bytes, str]:
    """Normalise a path, bytes or file object into (filename, data, mime)."""
    if isinstance(file, (str, os.PathLike)):
        path = Path(file)
        data = path.read_bytes()
        filename = filename or path.name
    elif isinstance(file, (bytes, bytearray)):
        data = bytes(file)
        if not filename:
            raise ValueError("filename= is required when uploading raw bytes")
    elif hasattr(file, "read"):
        data = file.read()
        if isinstance(data, str):
            data = data.encode()
        filename = filename or getattr(file, "name", None) or "upload"
        filename = Path(str(filename)).name
    else:
        raise TypeError("file must be a path, bytes, or a binary file object")

    if not data:
        raise ValueError("refusing to upload an empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"{filename} is {len(data)} bytes; the API limit is "
            f"{MAX_UPLOAD_BYTES} (10 MB)")
    mime = mime or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return filename, data, mime


class Attachments:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def upload(self, file: Any, *, filename: str | None = None,
               mime: str | None = None,
               chat_id: str | None = None) -> Attachment:
        """Upload a file. Accepts a path, raw bytes, or an open binary file.

        PDFs and text files have their text extracted server-side on upload, so
        it is available to the very next message in the chat.
        """
        name, data, content_type = _read_file(file, filename, mime)
        result = self._t.request(
            "POST", "/attachments",
            files={"file": (name, data, content_type)},
            data={"chat_id": chat_id} if chat_id else None)
        return Attachment.from_dict(result or {})

    def get(self, attachment_id: str) -> Attachment:
        """Re-fetch an attachment, which re-signs its URL.

        URLs are presigned for about an hour, so hold the id and call this when
        you need a link rather than storing the link itself.
        """
        data = self._t.request("GET", f"/attachments/{attachment_id}")
        return Attachment.from_dict(data or {})


class AsyncAttachments:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def upload(self, file: Any, *, filename: str | None = None,
                     mime: str | None = None,
                     chat_id: str | None = None) -> Attachment:
        name, data, content_type = _read_file(file, filename, mime)
        result = await self._t.request(
            "POST", "/attachments",
            files={"file": (name, data, content_type)},
            data={"chat_id": chat_id} if chat_id else None)
        return Attachment.from_dict(result or {})

    async def get(self, attachment_id: str) -> Attachment:
        data = await self._t.request("GET", f"/attachments/{attachment_id}")
        return Attachment.from_dict(data or {})


class Artifacts:
    """Files Vivid generated — anything a tool produced and attached to a reply."""

    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def list(self, *, limit: int = 60) -> list[Artifact]:
        data = self._t.request("GET", "/artifacts", params={"limit": limit})
        return [Artifact.from_dict(a) for a in (data or [])]


class AsyncArtifacts:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def list(self, *, limit: int = 60) -> list[Artifact]:
        data = await self._t.request("GET", "/artifacts",
                                     params={"limit": limit})
        return [Artifact.from_dict(a) for a in (data or [])]


class Health:
    def __init__(self, transport: Transport) -> None:
        self._t = transport

    def check(self) -> dict:
        """Backend liveness and the tools currently enabled."""
        return self._t.request("GET", "/health") or {}

    def models(self) -> dict:
        """Per-service health for the model tier. Worth polling before a batch
        of work: a cold pod reports here instead of failing mid-run."""
        return self._t.request("GET", "/health/models") or {}


class AsyncHealth:
    def __init__(self, transport: AsyncTransport) -> None:
        self._t = transport

    async def check(self) -> dict:
        return await self._t.request("GET", "/health") or {}

    async def models(self) -> dict:
        return await self._t.request("GET", "/health/models") or {}
