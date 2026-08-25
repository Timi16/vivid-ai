"""Mint a partner API key.

    docker compose exec backend python -m app.scripts.create_api_key "Acme" \
        --client vivid_web --max-sessions 5

Prints the key once. It is stored only as a SHA-256 hash, so a lost key cannot
be recovered — mint a new one and revoke the old.

Each key gets its own service-account user, which is what owns the chats,
attachments and browser sessions it creates. That keeps every existing
ownership check working untouched, and means revoking a key never touches
another partner's data.
"""
import argparse
import asyncio
import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.security import generate_api_key
from app.db.models import ApiKey, Client, User
from app.db.session import async_session, init_db


async def create(name: str, client_id: str, max_sessions: int) -> None:
    await init_db()
    async with async_session() as db:
        client = await db.get(Client, client_id)
        if client is None:
            sys.exit(f"unknown client '{client_id}'; create the clients row first")

        # Deterministic address so re-running for the same key name reuses the
        # account rather than orphaning data under a fresh one.
        slug = "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-")
        email = f"svc_{client_id}_{slug}@service.vivid"
        user = (await db.execute(
            select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            # "!api" can never be produced by bcrypt, so password login on a
            # service account always fails cleanly.
            user = User(email=email, password_hash="!api", name=f"{name} (service)")
            db.add(user)
            await db.flush()

        full_key, prefix, key_hash = generate_api_key()
        key = ApiKey(client_id=client_id, user_id=user.id, name=name,
                     prefix=prefix, key_hash=key_hash, max_sessions=max_sessions)
        db.add(key)
        await db.commit()

    print(f"\n  key       {full_key}")
    print(f"  id        {key.id}")
    print(f"  client    {client_id}")
    print(f"  account   {email}")
    print(f"  sessions  {max_sessions} concurrent browser sessions")
    print("\nStore it now — it is not recoverable.\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Mint a partner API key")
    parser.add_argument("name", help="who the key is for, e.g. 'Acme browsing'")
    parser.add_argument("--client", default=settings.DEFAULT_CLIENT_ID,
                        help="client row supplying prompts and tool allowlist")
    parser.add_argument("--max-sessions", type=int,
                        default=settings.BROWSER_SESSIONS_PER_KEY,
                        help="concurrent browser sessions this key may hold")
    args = parser.parse_args()
    asyncio.run(create(args.name, args.client, args.max_sessions))


if __name__ == "__main__":
    main()
