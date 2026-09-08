"""Developer API keys: the self-serve half of the partner API.

Someone who wants to build on Vivid signs in, opens Settings → Developer, and
generates a key here. That key then works on every `/v1` endpoint the app
itself uses, because `deps.get_principal` resolves a key and a session token
to the same `Principal`.

Two rules shape this module:

**A key acts as its own service account, never as the person who made it.**
The partner's chats, attachments and browser sessions belong to a dedicated
user row, so they never appear in the developer's own sidebar, and revoking a
key never touches anyone else's data. `owner_user_id` records the human, and
is what these endpoints scope to.

**A key cannot manage keys.** Every route here takes `get_session_user`, which
refuses an API key. Otherwise a leaked key would outlive its own revocation:
the holder would simply mint a replacement first.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_session_user
from app.core.config import settings
from app.core.security import generate_api_key
from app.core.errors import APIError
from app.db.models import ApiKey, User
from app.schemas.keys import ApiKeyCreate, ApiKeyCreated, ApiKeyOut

router = APIRouter(prefix="/keys", tags=["api keys"])
log = logging.getLogger("vivid.keys")


async def _service_account(db: AsyncSession, owner: User, name: str) -> User:
    """The user row a new key will act as.

    One per key rather than one per developer: two keys from the same person
    are two tenants, so revoking one cannot expose or delete the other's work.
    The address is unique and non-routable — nobody signs in as it.
    """
    account = User(
        email=f"svc_{uuid.uuid4().hex}@service.vivid",
        # "!api" can never be produced by bcrypt, so password login on a
        # service account always fails cleanly.
        password_hash="!api",
        name=f"{name} (API key)")
    db.add(account)
    await db.flush()
    return account


@router.post("", response_model=ApiKeyCreated, status_code=201)
async def create_key(body: ApiKeyCreate,
                     user: User = Depends(get_session_user),
                     db: AsyncSession = Depends(get_db)):
    """Generate a key. The secret is in this response and nowhere else.

    Only the SHA-256 hash is stored, so a lost key cannot be recovered by
    anyone, us included. Generate a new one and revoke the old.
    """
    live = (await db.execute(
        select(func.count()).select_from(ApiKey)
        .where(ApiKey.owner_user_id == user.id,
               ApiKey.revoked_at.is_(None)))).scalar_one()
    if live >= settings.API_KEYS_PER_USER:
        raise APIError(
            409, "too_many_keys",
            f"You already have {settings.API_KEYS_PER_USER} active keys. "
            "Revoke one before generating another.")

    name = body.name.strip()
    if not name:
        raise APIError(400, "bad_request", "A key needs a name.")

    account = await _service_account(db, user, name)
    full_key, prefix, key_hash = generate_api_key()
    key = ApiKey(client_id=settings.DEFAULT_CLIENT_ID, user_id=account.id,
                 owner_user_id=user.id, name=name, prefix=prefix,
                 key_hash=key_hash)
    db.add(key)
    await db.commit()
    await db.refresh(key)

    log.info("api key %s created by user %s", key.id, user.id)
    return ApiKeyCreated(key=full_key, **ApiKeyOut.model_validate(key).model_dump())


@router.get("", response_model=list[ApiKeyOut])
async def list_keys(user: User = Depends(get_session_user),
                    db: AsyncSession = Depends(get_db)):
    """This account's keys, newest first, secrets excluded.

    Revoked keys stay in the list: "this key stopped working on the 4th" is
    the answer to a support question, and hiding them only prompts the same
    question again.
    """
    rows = (await db.execute(
        select(ApiKey).where(ApiKey.owner_user_id == user.id)
        .order_by(ApiKey.created_at.desc()))).scalars()
    return [ApiKeyOut.model_validate(row) for row in rows]


@router.delete("/{key_id}", status_code=204)
async def revoke_key(key_id: str, user: User = Depends(get_session_user),
                     db: AsyncSession = Depends(get_db)):
    """Revoke a key. Takes effect on its next request.

    The row is kept rather than deleted: the service account it owns still
    holds chats and files, and a foreign key that vanishes takes those with
    it. Revoking twice is not an error — the caller wanted it dead, and it is.
    """
    key = (await db.execute(
        select(ApiKey).where(ApiKey.id == key_id,
                             ApiKey.owner_user_id == user.id)
    )).scalar_one_or_none()
    # Not found and not-yours are the same answer on purpose: otherwise this
    # endpoint reports whether an id exists on someone else's account.
    if key is None:
        raise APIError(404, "key_not_found", "No such API key on this account.")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        log.info("api key %s revoked by user %s", key.id, user.id)
