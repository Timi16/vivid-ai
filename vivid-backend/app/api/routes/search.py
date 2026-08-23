"""Search across a user's chats (spec 3.8): pgvector nearest-neighbour when the
embeddings service is configured, Postgres full-text always — for short exact
matches full-text beats vectors. Results are grouped by chat, best hit each."""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.db.models import User
from app.schemas.chat import SearchResponse, SearchResult
from app.services.models_gateway import embeddings

router = APIRouter(tags=["search"])
log = logging.getLogger("vivid.search")

_VECTOR_SQL = text("""
    SELECT m.id AS message_id, m.chat_id, m.role, m.content, c.title, c.language,
           1 - (e.embedding <=> CAST(:v AS vector)) AS score
    FROM message_embeddings e
    JOIN messages m ON m.id = e.message_id
    JOIN chats c ON c.id = m.chat_id
    WHERE c.user_id = :uid
    ORDER BY e.embedding <=> CAST(:v AS vector)
    LIMIT 40
""")

_FTS_SQL = text("""
    SELECT m.id AS message_id, m.chat_id, m.role, m.content, c.title, c.language,
           ts_rank(to_tsvector('english', m.content),
                   websearch_to_tsquery('english', :q)) AS score
    FROM messages m
    JOIN chats c ON c.id = m.chat_id
    WHERE c.user_id = :uid
      AND to_tsvector('english', m.content) @@ websearch_to_tsquery('english', :q)
    ORDER BY score DESC
    LIMIT 40
""")


def _result(row, source: str) -> SearchResult:
    return SearchResult(
        chat_id=row["chat_id"], title=row["title"], language=row["language"],
        message_id=row["message_id"], role=row["role"],
        snippet=row["content"][:200], score=float(row["score"]), source=source)


@router.get("/search", response_model=SearchResponse)
async def search(q: str = Query(min_length=1, max_length=500),
                 limit: int = Query(20, le=50),
                 user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    by_chat: dict[str, SearchResult] = {}

    if settings.EMBEDDINGS_URL:
        try:
            vecs = await embeddings.embed([q])
            if vecs:
                vec_str = "[" + ",".join(f"{x:.6f}" for x in vecs[0]) + "]"
                rows = await db.execute(_VECTOR_SQL, {"v": vec_str, "uid": user.id})
                for row in rows.mappings():
                    if row["chat_id"] not in by_chat:
                        by_chat[row["chat_id"]] = _result(row, "vector")
        except Exception as e:
            log.warning("vector search failed, using full-text only: %s", e)

    rows = await db.execute(_FTS_SQL, {"q": q, "uid": user.id})
    for row in rows.mappings():
        if row["chat_id"] not in by_chat:
            by_chat[row["chat_id"]] = _result(row, "text")

    return SearchResponse(query=q, results=list(by_chat.values())[:limit])
