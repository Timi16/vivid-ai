"""The /v1 model proxy: what a developer tool is allowed to ask for, what
reaches the pod, and what lands in the usage ledger.

The pod itself is stubbed. What matters here is the layer that exists because
Vivid Code used to talk to RunPod directly — the alias, the cap, the identity
and the accounting — not vLLM's behaviour.
"""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import Principal, get_principal
from app.api.routes import completions
from app.api.routes.completions import router
from app.core import errors
from app.core.config import settings
from app.db.models import User
from app.services.models_gateway import catalog, proxy


@pytest.fixture(autouse=True)
def pods(monkeypatch):
    """A deployment with both pods configured."""
    monkeypatch.setattr(settings, "LLM_BASE_URL", "https://chat.test/v1")
    monkeypatch.setattr(settings, "LLM_MODEL", "vendor/chat-27b")
    monkeypatch.setattr(settings, "CODE_LLM_BASE_URL", "https://coder.test/v1")
    monkeypatch.setattr(settings, "CODE_LLM_MODEL", "vendor/devstral")
    monkeypatch.setattr(settings, "MODEL_PROXY_ENABLED", True)
    monkeypatch.setattr(settings, "MODEL_PROXY_MAX_TOKENS", 4096)


@pytest.fixture
def recorded(monkeypatch) -> list[dict]:
    """The ledger, without a database behind it."""
    rows: list[dict] = []

    async def fake_record(principal, model_id, usage, stream):
        rows.append({"user": principal.user.id, "model": model_id,
                     "usage": usage, "stream": stream})

    monkeypatch.setattr(completions, "_record", fake_record)
    return rows


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    errors.install(app)
    app.include_router(router, prefix="/v1")
    app.dependency_overrides[get_principal] = lambda: Principal(
        user=User(id="u1", email="dev@vivid", password_hash="x"),
        client_id="vivid_code")
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def anon_client() -> TestClient:
    """No dependency override: the real bearer check runs."""
    app = FastAPI()
    errors.install(app)
    app.include_router(router, prefix="/v1")
    return TestClient(app, raise_server_exceptions=False)


# ------------------------------------------------------------------ catalogue
def test_default_model_is_the_coder():
    """Vivid Code discovers its engine by taking the first entry, so the order
    of the catalogue is a promise to it."""
    assert catalog.resolve(None).id == "vivid-code"
    assert catalog.resolve("vivid-code").upstream_model == "vendor/devstral"
    assert catalog.resolve("vivid-chat").base_url == "https://chat.test/v1"


def test_unknown_model_names_the_alternatives():
    with pytest.raises(catalog.UnknownModel) as excinfo:
        catalog.resolve("gpt-4o")
    assert "vivid-code" in str(excinfo.value)


def test_one_pod_deployment_still_serves_the_coder_alias(monkeypatch):
    monkeypatch.setattr(settings, "CODE_LLM_BASE_URL", "")
    monkeypatch.setattr(settings, "CODE_LLM_MODEL", "")
    assert catalog.resolve("vivid-code").upstream_model == "vendor/chat-27b"


def test_no_pods_configured_is_not_a_client_error(monkeypatch):
    monkeypatch.setattr(settings, "LLM_BASE_URL", "")
    monkeypatch.setattr(settings, "CODE_LLM_BASE_URL", "")
    with pytest.raises(catalog.UnknownModel):
        catalog.resolve(None)


# --------------------------------------------------------------------- payload
def test_payload_substitutes_the_model_and_caps_the_reply():
    model = catalog.resolve("vivid-code")
    payload = proxy.build_payload(
        {"model": "vivid-code", "messages": [{"role": "user", "content": "hi"}],
         "max_tokens": 999_999, "temperature": 0.2}, model, stream=False)
    assert payload["model"] == "vendor/devstral"
    assert payload["max_tokens"] == settings.MODEL_PROXY_MAX_TOKENS
    assert payload["temperature"] == 0.2


def test_payload_drops_fields_a_client_may_not_set():
    model = catalog.resolve("vivid-code")
    payload = proxy.build_payload(
        {"messages": [], "tools": [{"type": "function"}],
         "prompt_logprobs": 5, "lora_request": "evil"}, model, stream=True)
    assert payload["tools"] == [{"type": "function"}]
    assert "prompt_logprobs" not in payload
    assert "lora_request" not in payload
    assert payload["stream_options"] == {"include_usage": True}


def test_payload_accepts_either_spelling_of_the_token_cap():
    model = catalog.resolve("vivid-code")
    payload = proxy.build_payload(
        {"messages": [], "max_completion_tokens": 100}, model, stream=False)
    assert payload["max_tokens"] == 100


# ----------------------------------------------------------------------- route
def test_models_requires_a_credential(anon_client):
    r = anon_client.get("/v1/models")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


def test_models_lists_aliases_with_their_context_window(client):
    body = client.get("/v1/models").json()
    assert [m["id"] for m in body["data"]] == ["vivid-code", "vivid-chat"]
    assert body["data"][0]["max_model_len"] == settings.CODE_LLM_CONTEXT_TOKENS
    # No vendor string may leak: that is the whole point of the alias.
    assert "devstral" not in json.dumps(body).lower()


def test_unknown_model_is_a_404(client, recorded):
    r = client.post("/v1/chat/completions",
                    json={"model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "model_not_found"
    assert recorded == []


def test_messages_are_required(client):
    r = client.post("/v1/chat/completions", json={"model": "vivid-code"})
    assert r.status_code == 400


def test_completion_echoes_the_alias_and_bills_the_caller(client, recorded, monkeypatch):
    sent = {}

    async def fake_complete(model, payload):
        sent["url"] = model.base_url
        sent["payload"] = payload
        return {"id": "c1", "model": "vendor/devstral",
                "choices": [{"message": {"role": "assistant", "content": "ok"}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14}}

    monkeypatch.setattr(proxy, "complete", fake_complete)
    r = client.post("/v1/chat/completions",
                    json={"model": "vivid-code",
                          "messages": [{"role": "user", "content": "hi"}]})

    assert r.status_code == 200
    assert r.json()["model"] == "vivid-code"
    assert sent["url"] == "https://coder.test/v1"
    assert sent["payload"]["model"] == "vendor/devstral"
    assert recorded == [{"user": "u1", "model": "vivid-code", "stream": False,
                         "usage": {"prompt_tokens": 10, "completion_tokens": 4,
                                   "total_tokens": 14}}]


def test_upstream_refusal_reaches_the_client_verbatim(client, recorded, monkeypatch):
    """A context-length complaint is the most actionable thing a pod says; it
    must not be flattened into "the model returned 400"."""
    async def fake_complete(model, payload):
        raise proxy.UpstreamError("maximum context length is 100000 tokens", status=400)

    monkeypatch.setattr(proxy, "complete", fake_complete)
    r = client.post("/v1/chat/completions",
                    json={"model": "vivid-code", "messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 400
    assert "maximum context length" in r.json()["error"]["message"]
    assert recorded == []


def test_stream_passes_chunks_through_and_bills_the_usage(client, recorded, monkeypatch):
    class FakeStream:
        def __init__(self, model, payload):
            self.usage = None

        async def __aiter__(self):
            yield b'data: {"choices":[{"delta":{"content":"he"}}]}\n\n'
            yield b'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n'
            self.usage = {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5}
            yield b"data: [DONE]\n\n"

    monkeypatch.setattr(proxy, "StreamedCompletion", FakeStream)
    r = client.post("/v1/chat/completions",
                    json={"model": "vivid-code", "stream": True,
                          "messages": [{"role": "user", "content": "hi"}]})

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert "hello" == "".join(
        json.loads(line[5:])["choices"][0]["delta"]["content"]
        for line in r.text.splitlines()
        if line.startswith("data:") and "[DONE]" not in line)
    assert recorded == [{"user": "u1", "model": "vivid-code", "stream": True,
                         "usage": {"prompt_tokens": 3, "completion_tokens": 2,
                                   "total_tokens": 5}}]


def test_a_stream_that_dies_midway_still_bills_what_it_produced(client, recorded, monkeypatch):
    class DyingStream:
        def __init__(self, model, payload):
            self.usage = {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4}

        async def __aiter__(self):
            yield b'data: {"choices":[{"delta":{"content":"he"}}]}\n\n'
            raise proxy.UpstreamError("the model stopped responding")

    monkeypatch.setattr(proxy, "StreamedCompletion", DyingStream)
    r = client.post("/v1/chat/completions",
                    json={"model": "vivid-code", "stream": True,
                          "messages": [{"role": "user", "content": "hi"}]})

    assert r.status_code == 200  # the status line was already sent
    assert "stopped responding" in r.text
    assert recorded[0]["usage"]["completion_tokens"] == 1


def test_usage_is_read_off_the_wire_as_it_streams():
    """StreamedCompletion's own parsing, without an HTTP round trip."""
    streamed = proxy.StreamedCompletion(catalog.resolve("vivid-code"), {})
    streamed._note_usage('data: {"choices":[{"delta":{"content":"hi"}}]}')
    assert streamed.usage is None
    streamed._note_usage('data: {"choices":[],"usage":{"total_tokens":7}}')
    assert streamed.usage == {"total_tokens": 7}
    streamed._note_usage("data: [DONE]")
    assert streamed.usage == {"total_tokens": 7}


def test_the_proxy_can_be_turned_off(client, monkeypatch):
    monkeypatch.setattr(settings, "MODEL_PROXY_ENABLED", False)
    assert client.get("/v1/models").status_code == 503
