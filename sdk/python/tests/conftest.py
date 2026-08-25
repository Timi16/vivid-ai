"""A fake Vivid API built on httpx.MockTransport.

Real HTTP against a real backend belongs in the compose smoke test. These
tests exist to pin down SDK behaviour — ranking, staleness, redaction, retry
policy, error mapping — which is exactly the part a live server would make
slow and flaky to check.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

import httpx
import pytest

from vivid_ai import AsyncVivid, Vivid


@dataclass
class Recorder:
    """Every request the SDK made, for assertions about what went on the wire."""
    requests: list[httpx.Request] = field(default_factory=list)
    bodies: list[dict] = field(default_factory=list)

    def last_body(self) -> dict:
        return self.bodies[-1] if self.bodies else {}

    @property
    def paths(self) -> list[str]:
        return [r.url.path for r in self.requests]


SNAPSHOT_BODY = {
    "snapshot_id": "snap_1",
    "url": "https://example.com/",
    "title": "Example",
    "headings": ["Welcome"],
    "text": "some page text",
    "snapshot": "PAGE: Example ...",
    "elements": [
        {"tag": "a", "type": "", "label": "Search products"},
        {"tag": "button", "type": "", "label": "Search"},
        {"tag": "input", "type": "email", "label": "Email"},
        {"tag": "input", "type": "password", "label": "Password"},
        {"tag": "button", "type": "", "label": "Sign in"},
    ],
}

TASK_SSE = (
    "event: step\n"
    'data: {"action": "goto", "url": "https://example.com/"}\n'
    "\n"
    "event: step\n"
    'data: {"action": "click", "label": "Pricing", '
    '"url": "https://example.com/pricing"}\n'
    "\n"
    "event: result\n"
    'data: {"answer": "Enterprise is $99/seat.", "url": '
    '"https://example.com/pricing", "session_id": "bs_1", "steps": []}\n'
    "\n"
    "data: [DONE]\n"
    "\n"
)


def build_handler(recorder: Recorder, *, fail_times: int = 0,
                  status: int = 500):
    """Routes the fake API. `fail_times` makes the next N calls fail, so retry
    policy can be observed rather than assumed."""
    # A real server issues a new id per snapshot, since refs are renumbered
    # each time. The mock must too, or staleness can never be observed.
    state = {"remaining_failures": fail_times, "snapshots": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        recorder.requests.append(request)
        body = {}
        if request.content:
            try:
                body = json.loads(request.content)
            except (json.JSONDecodeError, UnicodeDecodeError):
                body = {"_raw": True}
        recorder.bodies.append(body)

        if state["remaining_failures"] > 0:
            state["remaining_failures"] -= 1
            return httpx.Response(status, json={
                "error": {"code": "capacity_exceeded",
                          "message": "browser tier is full",
                          "request_id": "req_retry"}})

        path = request.url.path
        method = request.method

        if path == "/v1/browser/sessions" and method == "POST":
            return httpx.Response(201, json={
                "id": "bs_1",
                "allowed_domains": body.get("allowed_domains") or [],
                "authenticated": bool(body.get("storage_state")),
                "created_at": "2026-08-25T10:00:00Z",
                "expires_at": "2026-08-25T10:10:00Z"})
        if path == "/v1/browser/sessions" and method == "GET":
            return httpx.Response(200, json=[{"id": "bs_1"}])
        if path.endswith("/goto"):
            return httpx.Response(200, json={"url": body.get("url"),
                                             "title": "Example"})
        if path.endswith("/snapshot"):
            state["snapshots"] += 1
            return httpx.Response(200, json={
                **SNAPSHOT_BODY, "snapshot_id": f"snap_{state['snapshots']}"})
        if path.endswith("/text"):
            return httpx.Response(200, json={"text": "readable body text",
                                             "url": "https://example.com/"})
        if path.endswith("/act"):
            return httpx.Response(200, json={
                "did": f"{body.get('action')} on element {body.get('ref')}",
                "url": "https://example.com/next"})
        if path.endswith("/storage_state"):
            return httpx.Response(200, json={
                "storage_state": {"cookies": [{"name": "sid"}]}})
        if path.startswith("/v1/browser/sessions/") and method == "DELETE":
            return httpx.Response(204)

        if path == "/v1/browser/tasks":
            return httpx.Response(
                200, text=TASK_SSE,
                headers={"content-type": "text/event-stream"})

        if path == "/v1/chats" and method == "POST":
            return httpx.Response(201, json={
                "id": "chat_1", "title": None, "language": body.get("language"),
                "client_id": "partner", "pinned": False,
                "created_at": "2026-08-25T10:00:00Z",
                "updated_at": "2026-08-25T10:00:00Z"})
        if path == "/v1/chats" and method == "GET":
            return httpx.Response(200, json=[{"id": "chat_1", "title": "Hi",
                                              "language": "en"}])
        if path.endswith("/messages"):
            return httpx.Response(200, json=[{
                "id": "m1", "chat_id": "chat_1", "role": "assistant",
                "content": "hello", "used_tools": True, "attachments": []}])
        if path == "/v1/attachments" and method == "POST":
            return httpx.Response(201, json={
                "id": "att_1", "kind": "file", "mime": "text/plain",
                "size_bytes": 5, "filename": "note.txt",
                "url": "https://minio/signed"})
        if path == "/v1/artifacts":
            return httpx.Response(200, json=[{
                "id": "a1", "kind": "file", "mime": "application/pdf",
                "size_bytes": 10, "url": "https://minio/a1",
                "chat_id": "chat_1", "chat_title": "Hi"}])
        if path == "/v1/search":
            return httpx.Response(200, json={
                "query": request.url.params.get("q"),
                "results": [{"chat_id": "chat_1", "message_id": "m1",
                             "role": "user", "snippet": "hi", "score": 0.9,
                             "source": "text"}]})
        if path == "/v1/health":
            return httpx.Response(200, json={"status": "ok"})
        if path == "/v1/health/models":
            return httpx.Response(200, json={"llm": {"ok": True}})

        return httpx.Response(404, json={
            "error": {"code": "not_found", "message": f"no route {path}"}})

    return handler


@pytest.fixture
def recorder() -> Recorder:
    return Recorder()


@pytest.fixture
def client(recorder: Recorder) -> Vivid:
    http = httpx.Client(transport=httpx.MockTransport(build_handler(recorder)))
    vivid = Vivid(api_key="vk_test", base_url="https://api.test",
                  http_client=http)
    yield vivid
    vivid.close()


@pytest.fixture
async def async_client(recorder: Recorder) -> AsyncVivid:
    http = httpx.AsyncClient(
        transport=httpx.MockTransport(build_handler(recorder)))
    vivid = AsyncVivid(api_key="vk_test", base_url="https://api.test",
                       http_client=http)
    yield vivid
    await vivid.close()
