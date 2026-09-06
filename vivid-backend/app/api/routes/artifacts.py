from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.db.models import Attachment, Chat, Message, User
from app.schemas.chat import ArtifactOut
from app.services import storage

router = APIRouter(prefix="/artifacts", tags=["artifacts"])


@router.get("", response_model=list[ArtifactOut])
async def list_artifacts(limit: int = Query(60, le=200),
                         user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """Everything Vivid generated for this user: files, images and video
    attached to assistant replies, newest first. Audio is left out; spoken
    replies are playback, not something to keep."""
    rows = await db.execute(
        select(Attachment, Chat.title)
        .join(Message, Message.id == Attachment.message_id)
        .join(Chat, Chat.id == Attachment.chat_id)
        .where(Attachment.user_id == user.id,
               Message.role == "assistant",
               Attachment.kind.in_(("file", "image", "video")))
        .order_by(Attachment.created_at.desc())
        .limit(limit))
    return [
        ArtifactOut(id=a.id, kind=a.kind, filename=a.filename, mime=a.mime,
                    size_bytes=a.size_bytes,
                    url=storage.presigned_url(a.storage_key),
                    chat_id=a.chat_id or "", chat_title=title,
                    message_id=a.message_id, created_at=a.created_at)
        for a, title in rows.all()
    ]
