"""The REST error envelope, and API-key minting."""
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core import errors
from app.core.errors import APIError
from app.core.security import (API_KEY_PREFIX, generate_api_key, hash_api_key,
                               looks_like_api_key)


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    errors.install(app)

    class Body(BaseModel):
        count: int

    @app.get("/coded")
    async def coded():
        raise APIError(429, "quota_exceeded", "too many sessions")

    @app.get("/legacy")
    async def legacy():
        raise HTTPException(status_code=404, detail="Chat not found")

    @app.post("/validated")
    async def validated(body: Body):
        return {"count": body.count}

    @app.get("/boom")
    async def boom():
        raise RuntimeError("postgresql://vivid:hunter2@db:5432/vivid")

    @app.get("/fine")
    async def fine():
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=False)


def test_coded_error_carries_code_and_request_id(client):
    r = client.get("/coded")
    assert r.status_code == 429
    body = r.json()["error"]
    assert body["code"] == "quota_exceeded"
    assert body["message"] == "too many sessions"
    assert body["request_id"].startswith("req_")
    assert r.headers["X-Request-Id"] == body["request_id"]


def test_bare_http_exceptions_gain_a_code(client):
    """Most routes still raise HTTPException. They must not be the one shape a
    partner cannot branch on."""
    body = client.get("/legacy").json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["message"] == "Chat not found"


def test_legacy_detail_is_still_present(client):
    """The frontend reads `detail` directly; dropping it would replace real
    error messages with 'Request failed (404)'."""
    assert client.get("/legacy").json()["detail"] == "Chat not found"


def test_validation_errors_name_the_field(client):
    r = client.post("/validated", json={"count": "not a number"})
    assert r.status_code == 422
    error = r.json()["error"]
    assert error["code"] == "invalid_request"
    assert "count" in error["message"]
    assert error["fields"][0]["field"] == "count"


def test_unhandled_errors_do_not_leak_internals(client):
    """An unhandled exception's message can carry connection strings, and this
    surface is now reachable by partners."""
    r = client.get("/boom")
    assert r.status_code == 500
    assert "hunter2" not in r.text
    assert "postgresql" not in r.text
    assert r.json()["error"]["request_id"].startswith("req_")


def test_every_response_carries_a_request_id(client):
    assert client.get("/fine").headers["X-Request-Id"].startswith("req_")


def test_inbound_request_id_is_honoured_but_bounded(client):
    r = client.get("/fine", headers={"X-Request-Id": "trace-abc"})
    assert r.headers["X-Request-Id"] == "trace-abc"
    long = client.get("/fine", headers={"X-Request-Id": "x" * 500})
    assert len(long.headers["X-Request-Id"]) <= 64


# --- API keys ---------------------------------------------------------------
def test_generated_keys_are_prefixed_and_unique():
    first, prefix, digest = generate_api_key()
    second, _, _ = generate_api_key()
    assert first.startswith(API_KEY_PREFIX)
    assert first != second
    assert first.startswith(prefix)
    assert hash_api_key(first) == digest


def test_only_the_hash_is_derivable():
    key, _, digest = generate_api_key()
    assert key not in digest
    assert len(digest) == 64


def test_credentials_are_told_apart_by_prefix():
    """Trying both would mean a bad key produces a JWT decode error, which is a
    confusing thing to hand a partner."""
    key, _, _ = generate_api_key()
    assert looks_like_api_key(key)
    assert not looks_like_api_key("eyJhbGciOiJIUzI1NiJ9.e30.abc")
