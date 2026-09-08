"""Developer API keys: minting, listing, revoking, and the rules that keep a
key from becoming more than it should be.

Runs against a real (SQLite) database rather than a stubbed session: what is
being tested here is ownership scoping and a uniqueness constraint, and a fake
that answers queries from a dict would assert nothing about either.
"""
import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pgvector.sqlalchemy import Vector
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from app.api.deps import Principal, get_db, get_principal
from app.api.routes.keys import router
from app.core import errors
from app.core.config import settings
from app.core.security import (API_KEY_PREFIX, LEGACY_KEY_PREFIXES,
                               generate_api_key, hash_api_key,
                               looks_like_api_key)
from app.db.models import ApiKey, Base, Client, User


# Two Postgres column types the rest of the schema uses. Neither is on the
# tables under test, but create_all builds every table, so SQLite needs a
# spelling for them.
@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(Vector, "sqlite")
def _vector_on_sqlite(type_, compiler, **kw):
    return "BLOB"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        session.add(Client(id=settings.DEFAULT_CLIENT_ID, name="Vivid Web"))
        await session.commit()
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def owner(db_session) -> User:
    user = User(email="dev@vivid", password_hash="x", name="Dev")
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture
def client(db_session, owner) -> TestClient:
    """The routes, signed in as `owner`."""
    app = FastAPI()
    errors.install(app)
    app.include_router(router, prefix="/v1")
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        user=owner, client_id=settings.DEFAULT_CLIENT_ID)
    return TestClient(app, raise_server_exceptions=False)


# ------------------------------------------------------------------- format
def test_new_keys_carry_the_vivid_prefix():
    key, prefix, digest = generate_api_key()
    assert key.startswith("vivid_")
    assert key.startswith(prefix) and len(prefix) < len(key)
    assert hash_api_key(key) == digest


def test_keys_issued_before_the_rename_still_authenticate():
    """`vk_` keys are in partners' config files. Renaming the prefix must not
    log them out."""
    assert looks_like_api_key(f"{LEGACY_KEY_PREFIXES[0]}whatever")
    assert looks_like_api_key(f"{API_KEY_PREFIX}whatever")
    assert not looks_like_api_key("eyJhbGciOiJIUzI1NiJ9.e30.abc")


# ------------------------------------------------------------------- minting
def test_create_returns_the_secret_exactly_once(client):
    created = client.post("/v1/keys", json={"name": "Acme production"})
    assert created.status_code == 201
    body = created.json()
    secret = body["key"]
    assert secret.startswith("vivid_")
    assert body["name"] == "Acme production"
    assert body["revoked_at"] is None

    # The list is the only other place a key appears, and the secret is not
    # in it — losing it means minting a new one.
    listed = client.get("/v1/keys").json()
    assert [k["id"] for k in listed] == [body["id"]]
    assert "key" not in listed[0]
    assert secret not in str(listed)
    assert listed[0]["prefix"] == secret[: len(listed[0]["prefix"])]


async def test_a_key_acts_as_its_own_account_not_the_developers(client, db_session, owner):
    """The whole point of a service account: a partner's chats must not land
    in the sidebar of the person who generated the key."""
    body = client.post("/v1/keys", json={"name": "Acme"}).json()
    key = (await db_session.execute(
        select(ApiKey).where(ApiKey.id == body["id"]))).scalar_one()

    assert key.owner_user_id == owner.id       # who may revoke it
    assert key.user_id != owner.id             # who it acts as
    account = await db_session.get(User, key.user_id)
    assert account.email.endswith("@service.vivid")
    assert account.password_hash == "!api"     # can never be signed into


async def test_two_keys_get_two_accounts(client, db_session):
    first = client.post("/v1/keys", json={"name": "staging"}).json()
    second = client.post("/v1/keys", json={"name": "staging"}).json()
    keys = (await db_session.execute(
        select(ApiKey).where(ApiKey.id.in_([first["id"], second["id"]])))).scalars().all()
    assert len({k.user_id for k in keys}) == 2
    assert first["key"] != second["key"]


def test_a_key_needs_a_name(client):
    assert client.post("/v1/keys", json={"name": "   "}).status_code == 400
    assert client.post("/v1/keys", json={}).status_code == 422


def test_the_number_of_live_keys_is_capped(client, monkeypatch):
    monkeypatch.setattr(settings, "API_KEYS_PER_USER", 2)
    ids = [client.post("/v1/keys", json={"name": f"k{n}"}).json()["id"] for n in range(2)]
    refused = client.post("/v1/keys", json={"name": "one too many"})
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "too_many_keys"

    # Revoking frees a slot: the cap counts live keys, not keys ever made.
    assert client.delete(f"/v1/keys/{ids[0]}").status_code == 204
    assert client.post("/v1/keys", json={"name": "replacement"}).status_code == 201


# ------------------------------------------------------------------ revoking
def test_revoking_stops_the_key_and_keeps_the_record(client):
    key_id = client.post("/v1/keys", json={"name": "leaked"}).json()["id"]
    assert client.delete(f"/v1/keys/{key_id}").status_code == 204

    listed = client.get("/v1/keys").json()
    assert len(listed) == 1, "a revoked key stays listed, so its history is answerable"
    assert listed[0]["revoked_at"] is not None


def test_revoking_twice_is_not_an_error(client):
    key_id = client.post("/v1/keys", json={"name": "gone"}).json()["id"]
    assert client.delete(f"/v1/keys/{key_id}").status_code == 204
    assert client.delete(f"/v1/keys/{key_id}").status_code == 204


async def test_one_account_cannot_touch_anothers_keys(client, db_session):
    stranger = User(email="stranger@vivid", password_hash="x")
    db_session.add(stranger)
    await db_session.flush()
    theirs = ApiKey(client_id=settings.DEFAULT_CLIENT_ID, user_id=stranger.id,
                    owner_user_id=stranger.id, name="theirs",
                    prefix="vivid_zzz", key_hash="other")
    db_session.add(theirs)
    await db_session.commit()

    assert client.get("/v1/keys").json() == []
    # 404 rather than 403: a 403 would confirm the id exists.
    assert client.delete(f"/v1/keys/{theirs.id}").status_code == 404
    assert (await db_session.get(ApiKey, theirs.id)).revoked_at is None


def test_unknown_ids_are_a_404(client):
    assert client.delete("/v1/keys/nope").status_code == 404


# ------------------------------------------------------------- who may do it
def test_an_api_key_cannot_manage_api_keys(db_session, owner):
    """A key that could mint keys would outlive its own revocation."""
    app = FastAPI()
    errors.install(app)
    app.include_router(router, prefix="/v1")
    app.dependency_overrides[get_db] = lambda: db_session

    account = User(id="svc", email="svc@service.vivid", password_hash="!api")
    key = ApiKey(id="k1", client_id=settings.DEFAULT_CLIENT_ID,
                 user_id=account.id, owner_user_id=owner.id, name="acme",
                 prefix="vivid_abc", key_hash="h")
    app.dependency_overrides[get_principal] = lambda: Principal(
        user=account, client_id=settings.DEFAULT_CLIENT_ID, api_key=key)
    partner = TestClient(app, raise_server_exceptions=False)

    for call in (lambda: partner.post("/v1/keys", json={"name": "escalate"}),
                 lambda: partner.get("/v1/keys"),
                 lambda: partner.delete("/v1/keys/k1")):
        response = call()
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "session_required"
