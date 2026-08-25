"""Secrets, error mapping, and the non-browsing resources."""
from __future__ import annotations

import logging

import httpx
import pytest
from conftest import Recorder, build_handler

from vivid_ai import (
    APIError,
    NotFound,
    RateLimited,
    Unauthorized,
    Vivid,
    VividError,
    secret,
)
from vivid_ai.errors import CapacityExceeded, StaleRef, from_response
from vivid_ai.secret import Secret, is_secret, reveal


# --- Secret -----------------------------------------------------------------
def test_secret_never_prints_itself(caplog):
    pw = secret("hunter2")
    assert "hunter2" not in repr(pw)
    assert "hunter2" not in str(pw)
    assert "hunter2" not in f"{pw}"
    assert "hunter2" not in f"{pw!r}"
    assert "hunter2" not in "{}".format(pw)  # noqa: UP032 — __format__ path
    assert "hunter2" not in f"{pw:>20}"


def test_secret_survives_logging(caplog):
    """The realistic leak is someone's own debug logging, not our code."""
    with caplog.at_level(logging.DEBUG):
        logging.getLogger("test").debug("typing %s into the form", secret("hunter2"))
    assert "hunter2" not in caplog.text
    assert "***" in caplog.text


def test_secret_leaks_only_on_explicit_reveal():
    assert secret("hunter2").reveal() == "hunter2"
    assert reveal(secret("hunter2")) == "hunter2"
    assert reveal("plain") == "plain"


def test_secret_is_detectable_and_does_not_nest():
    assert is_secret(secret("x"))
    assert not is_secret("x")
    assert Secret(secret("x")).reveal() == "x"


def test_secret_rejects_non_strings():
    with pytest.raises(TypeError):
        secret(1234)                              # type: ignore[arg-type]


def test_secret_compares_only_to_secret():
    assert secret("a") == secret("a")
    assert secret("a") != secret("b")
    # Guessing the contents with a plain string must not quietly succeed.
    assert (secret("a") == "a") is False


def test_secret_is_not_findable_by_hashing_a_guess():
    pw = secret("hunter2")
    assert {pw: 1}.get(secret("hunter2")) is None


def test_secret_refuses_to_pickle():
    """Pickle reaches past __repr__ to the value, so a Secret handed to
    multiprocessing or a disk cache would write the plaintext out. Crossing
    that boundary is the leak the redacted repr does not cover."""
    import pickle

    with pytest.raises(TypeError, match="cannot be pickled"):
        pickle.dumps(secret("hunter2"))

    # Every protocol, and nested inside a container the caller pickles.
    for protocol in range(pickle.HIGHEST_PROTOCOL + 1):
        with pytest.raises(TypeError):
            pickle.dumps(secret("hunter2"), protocol)
    with pytest.raises(TypeError):
        pickle.dumps({"credentials": {"password": secret("hunter2")}})


def test_secret_copies_as_itself_without_duplicating_the_plaintext():
    """Copying stays in memory and a Secret is immutable, so a copy can only
    be an alias — deep-copying a config dict that holds one must not break,
    and must not make a second plaintext copy either."""
    import copy

    pw = secret("hunter2")
    assert copy.copy(pw) is pw
    assert copy.deepcopy(pw) is pw
    assert copy.deepcopy({"password": pw})["password"] is pw


# --- error mapping ----------------------------------------------------------
def test_envelope_maps_to_typed_error():
    err = from_response(429, {"error": {"code": "capacity_exceeded",
                                        "message": "full",
                                        "request_id": "req_9"}})
    assert isinstance(err, CapacityExceeded)
    assert err.request_id == "req_9"
    assert "req_9" in str(err)


def test_legacy_detail_shape_still_maps():
    """Parts of the API predate the envelope; an SDK that only understood the
    new shape would report those as a blank message."""
    err = from_response(404, {"detail": "Chat not found"})
    assert isinstance(err, NotFound)
    assert err.message == "Chat not found"


def test_status_fallback_when_no_code():
    assert isinstance(from_response(401, {}), Unauthorized)


def test_unknown_code_degrades_to_api_error():
    """A code added server-side must not break an installed SDK."""
    err = from_response(400, {"error": {"code": "some_future_code",
                                        "message": "nope"}})
    assert isinstance(err, APIError)
    assert isinstance(err, VividError)


def test_rate_limited_carries_retry_after():
    err = from_response(429, {"error": {"code": "rate_limited",
                                        "message": "slow down"}},
                        retry_after=2.5)
    assert isinstance(err, RateLimited)
    assert err.retry_after == 2.5


def test_browser_errors_are_a_distinct_family():
    from vivid_ai import BrowserError
    assert issubclass(StaleRef, BrowserError)
    assert issubclass(BrowserError, VividError)


def test_error_from_the_wire_reaches_the_caller(recorder: Recorder):
    http = httpx.Client(transport=httpx.MockTransport(build_handler(recorder)))
    with Vivid(api_key="vk_test", base_url="https://api.test",
               http_client=http) as vivid, pytest.raises(NotFound, match="no route"):
        vivid.chats.get("missing")


# --- client construction ----------------------------------------------------
def test_api_key_can_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("VIVID_API_KEY", "vk_env")
    monkeypatch.setenv("VIVID_BASE_URL", "https://env.test")
    with Vivid() as vivid:
        assert vivid.base_url == "https://env.test"


def test_missing_api_key_says_what_to_do(monkeypatch):
    monkeypatch.delenv("VIVID_API_KEY", raising=False)
    with pytest.raises(ValueError, match="VIVID_API_KEY"):
        Vivid()


def test_supplied_http_client_still_gets_authenticated(recorder: Recorder):
    """Passing a client means "use my proxy/CA", not "skip authentication"."""
    http = httpx.Client(transport=httpx.MockTransport(build_handler(recorder)))
    with Vivid(api_key="vk_custom", base_url="https://api.test",
               http_client=http) as vivid:
        vivid.health.check()
    assert recorder.requests[0].headers["authorization"] == "Bearer vk_custom"


# --- resources --------------------------------------------------------------
def test_chats(client: Vivid, recorder: Recorder):
    chat = client.chats.create(language="en")
    assert chat.id == "chat_1"
    assert chat.client_id == "partner"
    assert chat.created_at is not None and chat.created_at.year == 2026
    assert client.chats.list()[0].title == "Hi"
    assert client.chats.messages("chat_1")[0].used_tools is True


def test_chat_update_requires_a_field(client: Vivid):
    with pytest.raises(ValueError, match="title= or pinned="):
        client.chats.update("chat_1")


def test_attachment_upload_from_bytes(client: Vivid):
    att = client.attachments.upload(b"hello", filename="note.txt")
    assert att.id == "att_1"
    assert att.filename == "note.txt"


def test_upload_from_path(client: Vivid, tmp_path):
    path = tmp_path / "note.txt"
    path.write_text("hello")
    assert client.attachments.upload(path).id == "att_1"


def test_upload_rejects_oversize_before_sending(client: Vivid,
                                                recorder: Recorder):
    with pytest.raises(ValueError, match="10 MB"):
        client.attachments.upload(b"x" * (10 * 1024 * 1024 + 1),
                                  filename="big.bin")
    assert recorder.requests == []                # never left the machine


def test_upload_rejects_empty(client: Vivid):
    with pytest.raises(ValueError, match="empty"):
        client.attachments.upload(b"", filename="empty.txt")


def test_upload_bytes_needs_a_filename(client: Vivid):
    with pytest.raises(ValueError, match="filename="):
        client.attachments.upload(b"hello")


def test_artifacts_and_search_and_health(client: Vivid):
    assert client.artifacts.list()[0].mime == "application/pdf"
    results = client.search("hi")
    assert results[0].source == "text" and results[0].score == 0.9
    assert client.health.check()["status"] == "ok"
    assert client.health.models()["llm"]["ok"] is True


def test_unknown_response_fields_are_ignored():
    """Forward compatibility: a field added server-side must not break an
    installed SDK."""
    from vivid_ai.types import Chat
    chat = Chat.from_dict({"id": "c", "brand_new_field": 1})
    assert chat.id == "c"


async def test_async_resources(async_client):
    assert (await async_client.chats.create()).id == "chat_1"
    assert (await async_client.artifacts.list())[0].id == "a1"
    assert (await async_client.search("hi"))[0].chat_id == "chat_1"
    assert (await async_client.health.check())["status"] == "ok"
    att = await async_client.attachments.upload(b"hello", filename="n.txt")
    assert att.id == "att_1"
