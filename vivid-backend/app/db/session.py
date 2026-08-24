from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.models import Base, Client

engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    from app.services.prompt import DEFAULT_PROMPTS

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_messages_fts ON messages "
            "USING gin (to_tsvector('english', content))"))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_message_embeddings_hnsw ON message_embeddings "
            "USING hnsw (embedding vector_cosine_ops)"))
        # create_all never alters existing tables; columns added after the
        # first deploy are applied idempotently here until real migrations.
        for column in ("name VARCHAR(120)", "avatar_url VARCHAR(1024)",
                       "profile_email VARCHAR(320)"):
            await conn.execute(text(
                f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {column}"))
        await conn.execute(text(
            "ALTER TABLE chats ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE"))

    async with async_session() as db:
        # Prompts are product config and deploy with the backend: upsert so a
        # prompt change in code reaches the DB-backed client row on restart.
        stmt = pg_insert(Client).values(
            id=settings.DEFAULT_CLIENT_ID, name="Vivid Web",
            config_json={"prompts": DEFAULT_PROMPTS})
        await db.execute(stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={"config_json": stmt.excluded.config_json}))
        await db.commit()
