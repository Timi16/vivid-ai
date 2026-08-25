"""The partner browsing routes, end to end through FastAPI.

vivid-tools is stubbed and the registry runs on the fake Redis, so this
exercises the real routing, validation, ownership and serialisation — which is
where the SDK's contract actually has to hold.
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.api.deps import Principal, get_principal
from app.core.config import settings
from app.db.models import ApiKey, User
from app.main import app
from app.services import browsing, vivid_tools
from app.services.browsing import vivid_tools as browsing_tools

OWNER_KEY = "key_partner"
OTHER_KEY = "key_other"


def _principal(key_id: str = OWNER_KEY, max_sessions: int = 3) -> Principal:
    user = User(id="svc_user", email="svc@service.vivid", password_hash="!api")
    key = ApiKey(id=key_id, client_id="vivid_web", user_id=user.id,
                 name="partner", prefix="vk_abc", key_hash="x",
                 max_sessions=max_sessions)
    return Principal(user=user, client_id="vivid_web", api_key=key)


class ToolsStub:
    """Stands in for the vivid-tools service."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []
        self.snapshots = 0

    async def call(self, path: str, payload: dict, timeout: int = 40) -> dict:
        self.calls.append((path, payload))
        if path == "/browse/session":
            return {"session": payload["session"], "authenticated": True}
        if path == "/browse/goto":
            return {"url": payload["url"], "title": "Example"}
        if path == "/browse/snapshot":
            self.snapshots += 1
            return {"snapshot": "PAGE: Example", "url": "https://example.com/",
                    "title": "Example", "headings": ["Welcome"],
                    "text": "body text",
                    "elements": [
                        {"tag": "input", "type": "email", "label": "Email (empty)"},
                        {"tag": "input", "type": "password",
                         "label": "Password (secret, empty)", "secret": True},
                        {"tag": "button", "type": "", "label": "Sign in"}]}
        if path == "/browse/act":
            return {"did": f"{payload['action']} on element", "url": "https://example.com/next"}
        if path == "/browse/text":
            return {"text": "readable text", "url": "https://example.com/"}
        if path == "/browse/storage_state":
            return {"storage_state": {"cookies": [{"name": "sid"}]}}
        if path == "/browse/close":
            return {"closed": True}
        return {}

    def bodies(self, path: str) -> list[dict]:
        return [p for (call_path, p) in self.calls if call_path == path]


@pytest.fixture
def tools(monkeypatch) -> ToolsStub:
    stub = ToolsStub()
    monkeypatch.setattr(settings, "VIVID_TOOLS_URL", "http://vivid-tools:8005")
    monkeypatch.setattr(vivid_tools, "call", stub.call)
    monkeypatch.setattr(browsing_tools, "call", stub.call)
    return stub


@pytest.fixture
def client(redis, tools) -> TestClient:
    # Deliberately not entering the TestClient context manager: that would run
    # the lifespan, which wants Postgres, Redis and MinIO. State the routes
    # actually read is supplied directly instead.
    app.state.redis = redis
    app.dependency_overrides[get_principal] = lambda: _principal()
    # raise_server_exceptions=False so the installed handlers produce the
    # envelope, exactly as they would in production.
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def open_session(client: TestClient, **body) -> dict:
    response = client.post("/v1/browser/sessions", json=body)
    assert response.status_code == 201, response.text
    return response.json()


# --- sessions ---------------------------------------------------------------
def test_open_session_returns_the_contract_shape(client, tools):
    body = open_session(client)
    assert body["id"].startswith("bs_")
    assert body["authenticated"] is False
    assert body["allowed_domains"] == []
    assert body["created_at"] and body["expires_at"]
    assert tools.bodies("/browse/session")[0]["session"] == body["id"]


def test_session_ids_are_server_issued(client):
    """A caller-chosen id was the tenancy hole: anyone could name someone
    else's session and drive their browser."""
    first = open_session(client)["id"]
    second = open_session(client)["id"]
    assert first != second


def test_authenticated_session_requires_domains(client, tools):
    response = client.post("/v1/browser/sessions",
                           json={"storage_state": {"cookies": []}})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert "allowed_domains" in response.json()["error"]["message"]
    assert tools.bodies("/browse/session") == []      # never reached the browser


def test_authenticated_session_forwards_state_and_domains(client, tools):
    body = open_session(client, storage_state={"cookies": [{"name": "sid"}]},
                        allowed_domains=["example.com"])
    assert body["authenticated"] is True
    forwarded = tools.bodies("/browse/session")[0]
    assert forwarded["storage_state"] == {"cookies": [{"name": "sid"}]}
    assert forwarded["allowed_domains"] == ["example.com"]


def test_quota_is_enforced_before_the_browser_is_asked(client, redis):
    app.dependency_overrides[get_principal] = lambda: _principal(max_sessions=1)
    open_session(client)
    response = client.post("/v1/browser/sessions", json={})
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "quota_exceeded"


def test_sessions_are_listed_and_closed(client):
    session_id = open_session(client)["id"]
    listed = client.get("/v1/browser/sessions").json()
    assert [s["id"] for s in listed] == [session_id]

    assert client.delete(f"/v1/browser/sessions/{session_id}").status_code == 204
    assert client.get("/v1/browser/sessions").json() == []


def test_closing_twice_is_not_an_error(client):
    """A client cleaning up in a `finally` must not fail for tidying twice."""
    session_id = open_session(client)["id"]
    assert client.delete(f"/v1/browser/sessions/{session_id}").status_code == 204
    assert client.delete(f"/v1/browser/sessions/{session_id}").status_code == 204


def test_another_key_cannot_reach_the_session(client):
    session_id = open_session(client)["id"]
    app.dependency_overrides[get_principal] = lambda: _principal(OTHER_KEY)
    response = client.post(f"/v1/browser/sessions/{session_id}/snapshot", json={})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "session_expired"


# --- driving ----------------------------------------------------------------
def test_goto_and_snapshot(client):
    session_id = open_session(client)["id"]
    nav = client.post(f"/v1/browser/sessions/{session_id}/goto",
                      json={"url": "https://example.com"}).json()
    assert nav["url"] == "https://example.com"

    snap = client.post(f"/v1/browser/sessions/{session_id}/snapshot",
                       json={}).json()
    assert snap["snapshot_id"].startswith("snap_")
    assert snap["title"] == "Example"
    assert [e["ref"] for e in snap["elements"]] == [0, 1, 2]
    assert snap["elements"][2]["label"] == "Sign in"


def test_goto_rejects_non_http(client):
    session_id = open_session(client)["id"]
    response = client.post(f"/v1/browser/sessions/{session_id}/goto",
                           json={"url": "javascript:alert(1)"})
    assert response.status_code == 422


def test_off_domain_navigation_is_refused(client, tools):
    session_id = open_session(client, storage_state={"cookies": []},
                              allowed_domains=["example.com"])["id"]
    response = client.post(f"/v1/browser/sessions/{session_id}/goto",
                           json={"url": "https://evil.com/steal"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "domain_not_allowed"
    assert tools.bodies("/browse/goto") == []          # never left the backend


def test_act_requires_a_current_snapshot(client):
    session_id = open_session(client)["id"]
    response = client.post(f"/v1/browser/sessions/{session_id}/act",
                           json={"ref": 0, "action": "click"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "stale_ref"


def test_act_rejects_a_ref_from_an_older_snapshot(client):
    session_id = open_session(client)["id"]
    first = client.post(f"/v1/browser/sessions/{session_id}/snapshot",
                        json={}).json()["snapshot_id"]
    client.post(f"/v1/browser/sessions/{session_id}/snapshot", json={})
    response = client.post(f"/v1/browser/sessions/{session_id}/act",
                           json={"ref": 0, "action": "click",
                                 "snapshot_id": first})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "stale_ref"


def test_act_accepts_the_current_snapshot(client):
    session_id = open_session(client)["id"]
    snapshot_id = client.post(f"/v1/browser/sessions/{session_id}/snapshot",
                              json={}).json()["snapshot_id"]
    response = client.post(f"/v1/browser/sessions/{session_id}/act",
                           json={"ref": 2, "action": "click",
                                 "snapshot_id": snapshot_id})
    assert response.status_code == 200
    assert response.json()["did"]


def test_secret_flag_is_forwarded_and_the_value_is_not_echoed(client, tools):
    session_id = open_session(client)["id"]
    client.post(f"/v1/browser/sessions/{session_id}/snapshot", json={})
    response = client.post(f"/v1/browser/sessions/{session_id}/act",
                           json={"ref": 1, "action": "type",
                                 "value": "hunter2", "secret": True})
    assert response.status_code == 200
    forwarded = tools.bodies("/browse/act")[0]
    assert forwarded["value"] == "hunter2"    # the browser needs the real one
    assert forwarded["secret"] is True        # ...and must mark the field
    assert "hunter2" not in response.text     # but it never comes back


def test_storage_state_round_trips(client):
    session_id = open_session(client, allowed_domains=["example.com"])["id"]
    body = client.get(f"/v1/browser/sessions/{session_id}/storage_state").json()
    assert body["storage_state"] == {"cookies": [{"name": "sid"}]}


def test_read_text(client):
    session_id = open_session(client)["id"]
    body = client.post(f"/v1/browser/sessions/{session_id}/text",
                       json={"selector": "main"}).json()
    assert body["text"] == "readable text"


# --- tasks ------------------------------------------------------------------
def _script(monkeypatch, decisions):
    queue = list(decisions)

    async def fake_complete(messages, max_tokens=256, temperature=None):
        return json.dumps(queue.pop(0)) if queue else json.dumps(
            {"action": "done", "answer": "fallback"})

    monkeypatch.setattr(browsing.llm, "complete", fake_complete)


def test_task_returns_answer_and_trail(client, monkeypatch):
    _script(monkeypatch, [{"action": "click", "ref": 2},
                          {"action": "done", "answer": "Enterprise is $99."}])
    body = client.post("/v1/browser/tasks",
                       json={"goal": "find pricing",
                             "url": "https://example.com"}).json()
    assert body["answer"] == "Enterprise is $99."
    assert [s["action"] for s in body["steps"]] == ["click", "done"]
    assert body["truncated"] is False


def test_task_streams_sse(client, monkeypatch):
    _script(monkeypatch, [{"action": "click", "ref": 2},
                          {"action": "done", "answer": "Enterprise is $99."}])
    with client.stream("POST", "/v1/browser/tasks",
                       json={"goal": "find pricing", "url": "https://example.com",
                             "stream": True}) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        text = "".join(response.iter_text())

    assert "event: step" in text
    assert "event: result" in text
    assert text.rstrip().endswith("data: [DONE]")


def test_task_requires_a_url_without_a_session(client):
    response = client.post("/v1/browser/tasks", json={"goal": "x"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_task_rejects_an_absurd_step_budget(client):
    response = client.post("/v1/browser/tasks",
                           json={"goal": "x", "url": "https://e.com",
                                 "max_steps": 1000})
    assert response.status_code == 422


def test_task_reuses_a_caller_session_and_leaves_it_open(client, monkeypatch,
                                                         tools):
    """A session the caller opened may hold their login; the task must not
    close it on the way out."""
    _script(monkeypatch, [{"action": "done", "answer": "found it"}])
    session_id = open_session(client, storage_state={"cookies": []},
                              allowed_domains=["example.com"])["id"]
    body = client.post("/v1/browser/tasks",
                       json={"goal": "find the invoice",
                             "session_id": session_id}).json()
    assert body["answer"] == "found it"
    assert [p["session"] for p in tools.bodies("/browse/close")] == []
    assert [s["id"] for s in client.get("/v1/browser/sessions").json()] == [session_id]


def test_task_closes_the_session_it_created(client, monkeypatch, tools):
    _script(monkeypatch, [{"action": "done", "answer": "ok"}])
    client.post("/v1/browser/tasks",
                json={"goal": "x", "url": "https://example.com"})
    assert len(tools.bodies("/browse/close")) == 1
    assert client.get("/v1/browser/sessions").json() == []
