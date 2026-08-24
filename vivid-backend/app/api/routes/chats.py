import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.db.models import Attachment, Chat, Message, User
from app.schemas.chat import (AttachmentOut, ChatCreate, ChatOut, ChatUpdate,
                              MessageOut)
from app.services import storage
from app.services.models_gateway import tts

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


@router.get("/{chat_id}", response_model=ChatOut)
async def get_chat(chat_id: str, user: User = Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)):
    return await _owned_chat(chat_id, user, db)


@router.patch("/{chat_id}", response_model=ChatOut)
async def update_chat(chat_id: str, body: ChatUpdate,
                      user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    """Rename or pin a chat. Fields left out stay as they are."""
    chat = await _owned_chat(chat_id, user, db)
    if body.title is not None:
        chat.title = body.title.strip() or None
    if body.pinned is not None:
        chat.pinned = body.pinned
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


@router.post("/{chat_id}/messages/{message_id}/speech", response_model=AttachmentOut)
async def speak_message(chat_id: str, message_id: str,
                        user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    """On-demand spoken version of an assistant reply. Voice turns store their
    audio at generation time; typed turns get theirs synthesized here on the
    first play and cached as a normal audio attachment."""
    chat = await _owned_chat(chat_id, user, db)
    msg = await db.get(Message, message_id)
    if msg is None or msg.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.role != "assistant":
        raise HTTPException(status_code=400,
                            detail="Only assistant replies can be spoken")

    existing = (await db.execute(
        select(Attachment).where(Attachment.message_id == message_id,
                                 Attachment.kind == "audio"))).scalars().first()
    if existing is not None:
        out = AttachmentOut.model_validate(existing)
        out.url = storage.presigned_url(existing.storage_key)
        return out

    # The pipeline saves the reply post-translation, so the stored content is
    # already in the chat's language and speaks as-is.
    try:
        wav = await tts.synthesize(
            msg.content, tts.speak_language(chat.language, translated=True))
    except tts.TTSUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    key = f"{user.id}/{chat_id}/{uuid.uuid4()}.wav"
    await storage.upload(key, wav, "audio/wav")
    att = Attachment(message_id=message_id, chat_id=chat_id, user_id=user.id,
                     kind="audio", filename="reply.wav", storage_key=key,
                     mime="audio/wav", size_bytes=len(wav))
    db.add(att)
    await db.commit()
    out = AttachmentOut.model_validate(att)
    out.url = storage.presigned_url(key)
    return out


@router.delete("/{chat_id}", status_code=204)
async def delete_chat(chat_id: str, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    await _owned_chat(chat_id, user, db)
    # Rows cascade in Postgres; stored objects are left for a cleanup job later.
    await db.execute(delete(Chat).where(Chat.id == chat_id))
    await db.commit()
