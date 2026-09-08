"""Generation and tools over HTTP: what a partner with a key can call.

The upstream and object storage are stubbed. What is tested is the layer that
exists because a partner has no model and no websocket: the job handoff for
video, the storing of what gets made, and the failure shapes a caller has to
branch on.
"""
import base64

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
from app.api.routes.media import router as media_router
from app.api.routes.tools import router as tools_router
from app.core import errors
from app.core.config import settings
from app.db.models import Attachment, Base, Client, MediaJob, User
from app.services import storage
from app.services import tools as tools_svc
from app.services.models_gateway import media, stt, tts


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
async def partner(db_session) -> User:
    user = User(email="svc@service.vivid", password_hash="!api")
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture
def stored(monkeypatch) -> dict:
    """Object storage, without one."""
    kept: dict[str, bytes] = {}

    async def upload(key, data, mime):
        kept[key] = data

    monkeypatch.setattr(storage, "upload", upload)
    monkeypatch.setattr(storage, "presigned_url", lambda key, **kw: f"https://files.test/{key}")
    return kept


@pytest.fixture
def client(db_session, partner, stored) -> TestClient:
    app = FastAPI()
    errors.install(app)
    app.include_router(media_router, prefix="/v1")
    app.include_router(tools_router, prefix="/v1")
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        user=partner, client_id=settings.DEFAULT_CLIENT_ID)
    # No Redis in these tests, so the rate limiter fails open, as in production
    # when the cache is down.
    app.state.redis = None
    return TestClient(app, raise_server_exceptions=False)


PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32


# -------------------------------------------------------------------- images
def test_an_image_comes_back_as_a_stored_file(client, monkeypatch, stored):
    async def fake(prompt, aspect_ratio="1:1"):
        assert prompt == "a blue cat"
        return PNG, "image/png"

    monkeypatch.setattr(media, "generate_image", fake)
    monkeypatch.setattr(media, "image_available", lambda: True)

    body = client.post("/v1/images/generations", json={"prompt": "a blue cat"}).json()
    assert len(body["data"]) == 1
    file = body["data"][0]
    assert file["mime"] == "image/png" and file["kind"] == "image"
    assert file["url"].startswith("https://files.test/")
    assert file["b64_json"] is None
    assert len(stored) == 1, "the bytes were actually stored"


def test_the_bytes_can_come_back_inline(client, monkeypatch):
    monkeypatch.setattr(media, "generate_image",
                        lambda prompt, aspect_ratio="1:1": _done((PNG, "image/png")))
    monkeypatch.setattr(media, "image_available", lambda: True)
    body = client.post("/v1/images/generations",
                       json={"prompt": "a cat", "response_format": "b64_json"}).json()
    file = body["data"][0]
    assert base64.b64decode(file["b64_json"]) == PNG
    # A caller asking for bytes is not also handed a link to the same thing.
    assert file["url"] is None


def _done(value):
    async def run(*a, **kw):
        return value
    return run()


def test_a_refused_prompt_is_the_callers_fault(client, monkeypatch):
    async def refuse(prompt, aspect_ratio="1:1"):
        raise media.MediaRejected("the model declined: content policy")

    monkeypatch.setattr(media, "generate_image", refuse)
    monkeypatch.setattr(media, "image_available", lambda: True)
    r = client.post("/v1/images/generations", json={"prompt": "nope"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "prompt_rejected"


def test_an_upstream_outage_is_ours(client, monkeypatch):
    async def die(prompt, aspect_ratio="1:1"):
        raise media.MediaUnavailable("image generation returned 402: no credit")

    monkeypatch.setattr(media, "generate_image", die)
    monkeypatch.setattr(media, "image_available", lambda: True)
    r = client.post("/v1/images/generations", json={"prompt": "a cat"})
    assert r.status_code == 503
    # The upstream's own words stay in the log, not in the response.
    assert "402" not in r.text and "credit" not in r.text.lower()


def test_image_generation_can_be_unconfigured(client, monkeypatch):
    monkeypatch.setattr(media, "image_available", lambda: False)
    assert client.post("/v1/images/generations", json={"prompt": "x"}).status_code == 503


def test_a_prompt_is_required(client):
    assert client.post("/v1/images/generations", json={}).status_code == 422
    assert client.post("/v1/images/generations", json={"prompt": ""}).status_code == 422


# --------------------------------------------------------------------- video
async def test_video_hands_back_a_job_then_the_clip(client, monkeypatch, db_session):
    """The whole point of the job: POST returns in milliseconds, and the
    caller's poll is what drives the render to completion."""
    monkeypatch.setattr(media, "video_available", lambda: True)

    async def submit(prompt, seconds=None, aspect_ratio="16:9"):
        return "upstream-1", media.VIDEO_PENDING

    monkeypatch.setattr(media, "submit_video", submit)

    started = client.post("/v1/videos", json={"prompt": "a cat running"})
    assert started.status_code == 202
    job = started.json()
    assert job["status"] == "pending" and job["video"] is None

    # Still rendering.
    async def pending(job_id):
        return media.VIDEO_PENDING, None

    monkeypatch.setattr(media, "video_status", pending)
    polled = client.get(f"/v1/videos/{job['id']}").json()
    assert polled["status"] == "pending" and polled["video"] is None

    # Finished.
    async def done(job_id):
        assert job_id == "upstream-1"
        return media.VIDEO_DONE, None

    async def download(job_id):
        return b"MP4BYTES", "video/mp4"

    monkeypatch.setattr(media, "video_status", done)
    monkeypatch.setattr(media, "download_video", download)
    finished = client.get(f"/v1/videos/{job['id']}").json()
    assert finished["status"] == "completed"
    assert finished["video"]["mime"] == "video/mp4"
    assert finished["video"]["url"].startswith("https://files.test/")

    # A second poll returns the stored clip rather than downloading it again.
    async def explode(job_id):
        raise AssertionError("a finished job must not be downloaded twice")

    monkeypatch.setattr(media, "download_video", explode)
    again = client.get(f"/v1/videos/{job['id']}").json()
    assert again["video"]["id"] == finished["video"]["id"]


async def test_a_failed_render_says_so_without_naming_the_upstream(client, monkeypatch):
    monkeypatch.setattr(media, "video_available", lambda: True)
    monkeypatch.setattr(media, "submit_video",
                        lambda *a, **kw: _done(("upstream-2", media.VIDEO_PENDING)))
    job = client.post("/v1/videos", json={"prompt": "x"}).json()

    async def failed(job_id):
        return media.VIDEO_FAILED, "openrouter said the job expired"

    monkeypatch.setattr(media, "video_status", failed)
    body = client.get(f"/v1/videos/{job['id']}").json()
    assert body["status"] == "failed"
    assert "openrouter" not in body["error"].lower()


async def test_a_poll_that_cannot_reach_the_upstream_keeps_the_job_alive(client, monkeypatch):
    """A blip must not kill a render that is still going."""
    monkeypatch.setattr(media, "video_available", lambda: True)
    monkeypatch.setattr(media, "submit_video",
                        lambda *a, **kw: _done(("upstream-3", media.VIDEO_PENDING)))
    job = client.post("/v1/videos", json={"prompt": "x"}).json()

    async def blip(job_id):
        raise media.MediaUnavailable("connection reset")

    monkeypatch.setattr(media, "video_status", blip)
    body = client.get(f"/v1/videos/{job['id']}").json()
    assert body["status"] == "pending" and body["error"] is None


async def test_one_account_cannot_poll_anothers_job(client, db_session, partner):
    stranger = User(email="stranger@vivid", password_hash="x")
    db_session.add(stranger)
    await db_session.flush()
    theirs = MediaJob(user_id=stranger.id, kind="video", status="pending",
                      upstream_id="u", prompt="secret")
    db_session.add(theirs)
    await db_session.commit()
    assert client.get(f"/v1/videos/{theirs.id}").status_code == 404


# --------------------------------------------------------------------- voice
def test_speech_returns_audio_by_default(client, monkeypatch):
    monkeypatch.setattr(tts, "synthesize",
                        lambda text, language, voice=None: _done(b"RIFFWAVE"))
    r = client.post("/v1/audio/speech", json={"input": "hello"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    assert r.content == b"RIFFWAVE"


def test_speech_can_be_stored_instead(client, monkeypatch, stored):
    monkeypatch.setattr(tts, "synthesize",
                        lambda text, language, voice=None: _done(b"RIFFWAVE"))
    body = client.post("/v1/audio/speech",
                       json={"input": "hello", "response_format": "url"}).json()
    assert body["kind"] == "audio"
    assert body["url"].startswith("https://files.test/")
    assert len(stored) == 1


def test_transcription_reports_what_it_heard(client, monkeypatch):
    async def fake(audio, language, mime):
        assert audio == b"AUDIO" and language == "auto"
        return "good morning", "en"

    monkeypatch.setattr(stt, "transcribe", fake)
    body = client.post("/v1/audio/transcriptions",
                       files={"file": ("clip.wav", b"AUDIO", "audio/wav")}).json()
    assert body == {"text": "good morning", "language": "en"}


def test_an_empty_upload_is_refused(client):
    r = client.post("/v1/audio/transcriptions",
                    files={"file": ("clip.wav", b"", "audio/wav")})
    assert r.status_code == 400


# --------------------------------------------------------------------- tools
def test_the_tool_list_is_what_this_deployment_can_actually_run(client):
    listed = client.get("/v1/tools").json()
    names = [t["name"] for t in listed]
    assert "now" in names, "a tool with no dependencies is always available"
    assert names == sorted(names)
    assert all(t["description"] for t in listed)


def test_running_a_tool_returns_the_observation(client):
    body = client.post("/v1/tools/now", json={"arguments": {}}).json()
    assert body["tool"] == "now"
    assert "Nigeria" in body["result"]
    assert body["files"] == []


def test_a_tool_that_fails_is_still_a_200(client, monkeypatch):
    """The assistant reads a failure as an observation and recovers. A caller
    running its own loop needs the same thing, not an exception."""
    body = client.post("/v1/tools/calculate",
                       json={"arguments": {"expression": "1/0"}}).json()
    assert body["tool"] == "calculate"
    assert body["result"]


def test_an_unknown_tool_names_the_real_ones(client):
    r = client.post("/v1/tools/teleport", json={"arguments": {}})
    assert r.status_code == 404
    assert "now" in r.json()["error"]["message"]


async def test_a_tool_that_makes_a_file_gets_it_stored(client, monkeypatch, db_session, stored):
    """run_code writing a chart, generate_image making a picture: whatever a
    tool leaves in outputs comes back as a stored file."""
    async def draws(args, ctx):
        ctx.outputs.append({"name": "chart.png", "mime": "image/png", "data": PNG})
        return "the chart is attached"

    monkeypatch.setitem(tools_svc.REGISTRY, "draw",
                        tools_svc.Tool(name="draw", fn=draws, desc="draw", context=True))
    body = client.post("/v1/tools/draw", json={"arguments": {}}).json()
    assert body["result"] == "the chart is attached"
    assert len(body["files"]) == 1
    assert body["files"][0]["filename"] == "chart.png"
    assert body["files"][0]["kind"] == "image"
    assert len(stored) == 1

    saved = (await db_session.execute(select(Attachment))).scalars().all()
    assert [a.filename for a in saved] == ["chart.png"]
    assert saved[0].chat_id is None, "an API file belongs to the caller, not a chat"
