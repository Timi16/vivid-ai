"""arq worker: run with `arq app.workers.worker.WorkerSettings`.

Jobs (spec 3.9): embed saved messages for search, generate a chat title after
the first exchange. Audio transcoding and heavier extraction can join later.
"""
import logging

from arq.connections import RedisSettings
from sqlalchemy import select

from app.core.config import settings
from app.db.models import Chat, Message, MessageEmbedding
from app.db.session import async_session
from app.services.models_gateway import embeddings, llm

log = logging.getLogger("vivid.worker")
logging.basicConfig(level=logging.INFO)


async def embed_message(ctx, message_id: str) -> None:
    if not settings.EMBEDDINGS_URL:
        return
    async with async_session() as db:
        msg = await db.get(Message, message_id)
        if msg is None or not msg.content.strip():
            return
        vecs = await embeddings.embed([msg.content[:8000]])
        if not vecs:
            return
        existing = await db.get(MessageEmbedding, message_id)
        if existing is not None:
            existing.embedding = vecs[0]
        else:
            db.add(MessageEmbedding(message_id=message_id, embedding=vecs[0]))
        await db.commit()


async def generate_chat_title(ctx, chat_id: str) -> None:
    async with async_session() as db:
        chat = await db.get(Chat, chat_id)
        if chat is None or chat.title:
            return
        rows = list((await db.execute(
            select(Message).where(Message.chat_id == chat_id,
                                  Message.role.in_(("user", "assistant")))
            .order_by(Message.created_at).limit(2))).scalars())
        if not rows:
            return
        convo = "\n".join(f"{m.role}: {m.content[:400]}" for m in rows)
        try:
            title = await llm.complete(
                [{"role": "user",
                  "content": ("Give a 3-6 word title for this conversation. "
                              "Reply with the title only, no quotes.\n\n" + convo)}],
                max_tokens=16, temperature=0.3)
        except llm.LLMUnavailable as e:
            log.info("title generation skipped for %s: %s", chat_id, e)
            return
        title = title.strip().strip('"').strip()[:80]
        if title:
            chat.title = title
            await db.commit()


class WorkerSettings:
    functions = [embed_message, generate_chat_title]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 10
    max_tries = 3
