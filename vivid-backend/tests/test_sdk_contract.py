"""The SDK driven against the real routes.

Both sides were built from the same plan, but they were built separately: the
SDK against an in-process mock, the server against the schemas. This is the
test that catches the two disagreeing — a renamed field, a status code the SDK
maps to the wrong exception, an SSE event name that does not match.

Skipped when the SDK is not installed, so the backend suite stands alone.
"""
import json

import httpx
import pytest

from app.api.deps import Principal, get_principal
from app.core.config import settings
from app.db.models import ApiKey, User
from app.main import app
from app.services import browsing, vivid_tools
from app.services.browsing import vivid_tools as browsing_tools

vivid_ai = pytest.importorskip("vivid_ai", reason="SDK not installed")

from tests.test_browser_routes import ToolsStub, _principal  # noqa: E402


@pytest.fixture
def sdk(redis, monkeypatch):
    """An AsyncVivid client whose transport is this FastAPI app."""
    stub = ToolsStub()
    monkeypatch.setattr(settings, "VIVID_TOOLS_URL", "http://vivid-tools:8005")
    monkeypatch.setattr(vivid_tools, "call", stub.call)
    monkeypatch.setattr(browsing_tools, "call", stub.call)

    app.state.redis = redis
    app.dependency_overrides[get_principal] = lambda: _principal()

    http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                             base_url="http://backend")
    client = vivid_ai.AsyncVivid(api_key="vk_test", base_url="http://backend",
                                 http_client=http)
    yield client, stub
    app.dependency_overrides.clear()


async def test_sdk_drives_a_session_end_to_end(sdk):
    client, stub = sdk
    session = await client.browser.session()
    try:
        nav = await session.goto("https://example.com")
        assert nav.url == "https://example.com"
        assert nav.title == "Example"

        snap = await session.snapshot()
        assert snap.title == "Example"
        assert snap.headings == ["Welcome"]
        assert len(snap) == 3
        # The SDK's ranking and the server's element order agree.
        assert snap.find("Sign in").ref == 2
        assert snap.find("Password", kind="input/password").ref == 1

        result = await session.click(snap.find("Sign in"))
        assert result.did
    finally:
        await session.close()
    assert (await client.browser.sessions()) == []


async def test_sdk_secret_reaches_the_browser_and_nothing_else(sdk):
    client, stub = sdk
    session = await client.browser.session(allowed_domains=["example.com"])
    snap = await session.snapshot()
    await session.type(snap.find("Password"), vivid_ai.secret("hunter2"))
    await session.close()

    forwarded = [p for (path, p) in stub.calls if path == "/browse/act"][0]
    assert forwarded["value"] == "hunter2"
    assert forwarded["secret"] is True


async def test_sdk_and_server_agree_on_stale_refs(sdk):
    """Both halves of the guard, and that they mean the same thing.

    The SDK refuses a stale ref before the network. A partner not using the
    SDK must hit the server's own check and get an error that maps back to the
    same exception — otherwise the two disagree about what "stale" is.
    """
    client, _ = sdk
    session = await client.browser.session()
    first = await session.snapshot()
    await session.snapshot()                    # invalidates `first`

    # Client-side: never leaves the machine.
    with pytest.raises(vivid_ai.StaleRef):
        await session.click(first.find("Sign in"))

    # Server-side, with the SDK's local check deliberately sidestepped.
    with pytest.raises(vivid_ai.StaleRef):
        await client._transport.request(  # noqa: SLF001
            "POST", f"/browser/sessions/{session.id}/act",
            json_body={"ref": 0, "action": "click",
                       "snapshot_id": first.snapshot_id})
    await session.close()


async def test_authenticated_session_rules_match(sdk):
    client, _ = sdk
    # The SDK refuses before the network...
    with pytest.raises(ValueError, match="allowed_domains is required"):
        await client.browser.session(storage_state={"cookies": []})

    # ...and the server refuses too, for callers who are not using the SDK.
    with pytest.raises(vivid_ai.VividError) as exc:
        await client._transport.request(  # noqa: SLF001
            "POST", "/browser/sessions",
            json_body={"storage_state": {"cookies": []}})
    assert exc.value.status == 422


async def test_domain_scoping_maps_to_the_sdk_exception(sdk):
    client, _ = sdk
    session = await client.browser.session(
        storage_state={"cookies": []}, allowed_domains=["example.com"])
    with pytest.raises(vivid_ai.DomainNotAllowed):
        await session.goto("https://evil.com/steal")
    await session.close()


async def test_quota_maps_to_the_sdk_exception(sdk, redis):
    client, _ = sdk
    app.dependency_overrides[get_principal] = lambda: _principal(max_sessions=1)
    first = await client.browser.session()
    with pytest.raises(vivid_ai.QuotaExceeded):
        await client.browser.session()
    await first.close()


async def test_unknown_session_maps_to_session_expired(sdk):
    client, _ = sdk
    session = await client.browser.session()
    await session.close()
    with pytest.raises(vivid_ai.SessionExpired):
        await client._transport.request(  # noqa: SLF001
            "POST", f"/browser/sessions/{session.id}/snapshot", json_body={})


async def test_sdk_streams_a_task(sdk, monkeypatch):
    """The SSE event names, the step fields and the result shape all have to
    line up, or the SDK silently yields nothing."""
    queue = [{"action": "click", "ref": 2},
             {"action": "done", "answer": "Enterprise is $99."}]

    async def fake_complete(messages, max_tokens=256, temperature=None):
        return json.dumps(queue.pop(0)) if queue else json.dumps(
            {"action": "done", "answer": "fallback"})

    monkeypatch.setattr(browsing.llm, "complete", fake_complete)

    client, _ = sdk
    task = client.browser.run(goal="find pricing", url="https://example.com")
    steps = [step async for step in task]
    assert [s.action for s in steps] == ["click", "done"]
    result = await task.result()
    assert result.answer == "Enterprise is $99."
    assert result.truncated is False


async def test_sdk_task_inside_an_authenticated_session(sdk, monkeypatch):
    async def fake_complete(messages, max_tokens=256, temperature=None):
        return json.dumps({"action": "done", "answer": "found the invoice"})

    monkeypatch.setattr(browsing.llm, "complete", fake_complete)

    client, _ = sdk
    session = await client.browser.session(storage_state={"cookies": []},
                                           allowed_domains=["example.com"])
    task = client.browser.run(goal="find the invoice", session=session)
    result = await task.result()
    assert result.answer == "found the invoice"
    # The session the caller opened stays open — it may hold their login.
    assert [s.id for s in await client.browser.sessions()] == [session.id]
    await session.close()
