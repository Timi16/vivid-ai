import io
import re
import uuid

from fastapi import (APIRouter, Depends, File, Form, HTTPException, UploadFile)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.db.models import Attachment, Chat, User
from app.schemas.chat import AttachmentOut
from app.services import storage

router = APIRouter(prefix="/attachments", tags=["attachments"])

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _kind(mime: str) -> str:
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("audio/"):
        return "audio"
    return "file"


def _extract_text(data: bytes, mime: str) -> str | None:
    """PDF and plain-text extraction happens inline (fast at <=10 MB) so the
    text is available for the prompt on the very next message."""
    try:
        if mime == "application/pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
            return text.strip()[:50_000] or None
        if mime.startswith("text/") or mime in ("application/json",):
            return data.decode("utf-8", errors="replace").strip()[:50_000] or None
    except Exception:
        return None
    return None


@router.post("", response_model=AttachmentOut, status_code=201)
async def upload_attachment(file: UploadFile = File(...),
                            chat_id: str | None = Form(None),
                            user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    data = await file.read()
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 10 MB limit")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    if chat_id:
        chat = await db.get(Chat, chat_id)
        if chat is None or chat.user_id != user.id:
            raise HTTPException(status_code=404, detail="Chat not found")

    mime = file.content_type or "application/octet-stream"
    filename = _SAFE_NAME.sub("_", file.filename or "upload")[:200]
    key = f"{user.id}/{uuid.uuid4()}-{filename}"

    try:
        await storage.upload(key, data, mime)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Object storage unavailable: {e}")

    att = Attachment(chat_id=chat_id, user_id=user.id, kind=_kind(mime),
                     filename=filename, storage_key=key, mime=mime,
                     size_bytes=len(data),
                     extracted_text=_extract_text(data, mime))
    db.add(att)
    await db.commit()

    out = AttachmentOut.model_validate(att)
    out.url = storage.presigned_url(key)
    return out


@router.get("/{attachment_id}")
async def get_attachment(attachment_id: str,
                         user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    att = await db.get(Attachment, attachment_id)
    if att is None or att.user_id != user.id:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return {"id": att.id, "url": storage.presigned_url(att.storage_key),
            "expires_in": 3600}
