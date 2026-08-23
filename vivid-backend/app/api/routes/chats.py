from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.db.models import Attachment, Chat, Message, User
from app.schemas.chat import AttachmentOut, ChatCreate, ChatOut, MessageOut
from app.services import storage

router = APIRouter(prefix="/chats", tags=["chats"])


async def _owned_chat(chat_id: str, user: User, db: AsyncSession) -> Chat:
    chat = await db.get(Chat, chat_id)
    if chat is None or chat.user_id != user.id:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.get("", response_model=list[ChatOut])
async def list_chats(limit: int = Query(50, le=200), offset: int = 0,
                     user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    rows = await db.execute(
        select(Chat).where(Chat.user_id == user.id)
        .order_by(Chat.updated_at.desc()).limit(limit).offset(offset))
    return list(rows.scalars())


@router.post("", response_model=ChatOut, status_code=201)
async def create_chat(body: ChatCreate, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    chat = Chat(user_id=user.id, language=body.language, title=body.title)
    db.add(chat)
    await db.commit()
    return chat


@router.get("/{chat_id}/messages", response_model=list[MessageOut])
async def list_messages(chat_id: str, limit: int = Query(100, le=500),
                        offset: int = 0,
                        user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    await _owned_chat(chat_id, user, db)
    messages = list((await db.execute(
        select(Message).where(Message.chat_id == chat_id)
        .order_by(Message.created_at).limit(limit).offset(offset)
    )).scalars())

    atts_by_msg: dict[str, list[AttachmentOut]] = {}
    if messages:
        rows = (await db.execute(
            select(Attachment).where(
                Attachment.message_id.in_([m.id for m in messages]))
        )).scalars()
        for a in rows:
            out = AttachmentOut.model_validate(a)
            out.url = storage.presigned_url(a.storage_key)
            atts_by_msg.setdefault(a.message_id, []).append(out)

    result = []
    for m in messages:
        out = MessageOut.model_validate(m)
        out.attachments = atts_by_msg.get(m.id, [])
        result.append(out)
    return result


@router.delete("/{chat_id}", status_code=204)
async def delete_chat(chat_id: str, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    await _owned_chat(chat_id, user, db)
    # Rows cascade in Postgres; stored objects are left for a cleanup job later.
    await db.execute(delete(Chat).where(Chat.id == chat_id))
    await db.commit()
