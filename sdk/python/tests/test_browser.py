"""Browsing behaviour — the surface the SDK exists for."""
from __future__ import annotations

import httpx
import pytest
from conftest import Recorder, build_handler

from vivid_ai import CapacityExceeded, ElementNotFound, StaleRef, Vivid, secret
from vivid_ai.secret import REDACTED


# --- sessions ---------------------------------------------------------------
def test_session_sends_auth_and_returns_info(client: Vivid, recorder: Recorder):
    with client.browser.session() as s:
        assert s.id == "bs_1"
        assert not s.closed
    assert recorder.requests[0].headers["authorization"] == "Bearer vk_test"
    assert recorder.requests[0].headers["user-agent"].startswith("vivid-ai-python/")


def test_session_closes_on_exit(client: Vivid, recorder: Recorder):
    with client.browser.session() as s:
        session_id = s.id
    assert f"/v1/browser/sessions/{session_id}" in recorder.paths
    assert recorder.requests[-1].method == "DELETE"


def test_session_closes_even_when_body_raises(client: Vivid,
                                              recorder: Recorder):
    # A browser context is ~200MB against a quota; an exception must not leak
    # one. This is the whole reason session() is a context manager.
    with pytest.raises(RuntimeError), client.browser.session():
        raise RuntimeError("boom")
    assert recorder.requests[-1].method == "DELETE"


def test_double_close_is_not_an_error(client: Vivid):
    s = client.browser.session()
    s.close()
    s.close()
    assert s.closed


def test_using_a_closed_session_explains_itself(client: Vivid):
    s = client.browser.session()
    s.close()
    with pytest.raises(Exception, match="closed"):
        s.goto("https://example.com")


# --- authenticated sessions -------------------------------------------------
def test_authenticated_session_requires_allowed_domains(client: Vivid):
    """A session holding live cookies with unrestricted egress is a
    credential-theft primitive. The SDK refuses at the call site."""
    with pytest.raises(ValueError, match="allowed_domains is required"):
        client.browser.session(storage_state={"cookies": []})


def test_authenticated_session_with_domains_is_allowed(client: Vivid,
                                                       recorder: Recorder):
    s = client.browser.session(storage_state={"cookies": [{"name": "sid"}]},
                               allowed_domains=["example.com"])
    assert s.info.authenticated
    assert s.info.allowed_domains == ["example.com"]
    assert recorder.last_body()["storage_state"] == {"cookies": [{"name": "sid"}]}
    s.close()


def test_storage_state_round_trips(client: Vivid):
    with client.browser.session(allowed_domains=["example.com"]) as s:
        assert s.storage_state() == {"cookies": [{"name": "sid"}]}


# --- snapshots and element finding -----------------------------------------
def test_snapshot_parses_elements(client: Vivid):
    with client.browser.session() as s:
        snap = s.snapshot()
        assert snap.title == "Example"
        assert len(snap) == 5
        assert snap.elements[0].kind == "a"
        assert snap.elements[3].kind == "input/password"
        assert str(snap.elements[4]) == "[4] button: Sign in"


def test_find_prefers_exact_over_substring(client: Vivid):
    """"Search products" appears before "Search" in the element list, so a
    naive substring scan returns the wrong one."""
    with client.browser.session() as s:
        snap = s.snapshot()
        assert snap.find("Search").label == "Search"
        assert snap.find("Search products").label == "Search products"


def test_find_is_case_insensitive(client: Vivid):
    with client.browser.session() as s:
        assert s.snapshot().find("sign IN").label == "Sign in"


def test_find_can_filter_by_kind(client: Vivid):
    with client.browser.session() as s:
        el = s.snapshot().find("Password", kind="input/password")
        assert el.ref == 3


def test_find_lists_what_was_available_when_it_fails(client: Vivid):
    with client.browser.session() as s:
        with pytest.raises(ElementNotFound) as exc:
            s.snapshot().find("Checkout")
        assert "Checkout" in str(exc.value)
        assert "Sign in" in str(exc.value)      # tells you what you could pick


# --- stale refs -------------------------------------------------------------
def test_stale_ref_is_caught_client_side(client: Vivid):
    """Refs are positional and regenerate on every snapshot. Acting on one from
    an earlier snapshot silently hits whatever now sits at that index, which is
    how an agent clicks the wrong thing and reports success."""
    with client.browser.session() as s:
        first = s.snapshot()
        button = first.find("Sign in")
        s.snapshot()                              # invalidates `first`
        with pytest.raises(StaleRef, match="fresh snapshot"):
            s.click(button)


def test_ref_from_current_snapshot_is_accepted(client: Vivid,
                                               recorder: Recorder):
    with client.browser.session() as s:
        snap = s.snapshot()
        s.click(snap.find("Sign in"))
        body = recorder.last_body()
        assert body["ref"] == 4
        assert body["snapshot_id"] == "snap_1"


def test_navigation_invalidates_refs(client: Vivid):
    with client.browser.session() as s:
        snap = s.snapshot()
        el = snap.find("Sign in")
        s.goto("https://example.com/other")
        with pytest.raises(StaleRef):
            s.click(el)


def test_bare_int_ref_is_accepted_for_parity(client: Vivid,
                                             recorder: Recorder):
    with client.browser.session() as s:
        s.snapshot()
        s.click(2)
        assert recorder.last_body()["ref"] == 2


# --- credentials ------------------------------------------------------------
def test_secret_value_is_sent_but_flagged(client: Vivid, recorder: Recorder):
    with client.browser.session(allowed_domains=["example.com"]) as s:
        snap = s.snapshot()
        s.type(snap.find("Password"), secret("hunter2"))
    body = recorder.bodies[-2]                    # last is the DELETE
    assert body["value"] == "hunter2"             # Playwright needs the real one
    assert body["secret"] is True                 # ...and the service must mark it


def test_plain_string_is_not_flagged_secret(client: Vivid,
                                            recorder: Recorder):
    with client.browser.session() as s:
        snap = s.snapshot()
        s.type(snap.find("Email"), "bot@example.com")
    assert "secret" not in recorder.bodies[-2]


def test_submit_sends_value(client: Vivid, recorder: Recorder):
    with client.browser.session() as s:
        snap = s.snapshot()
        s.submit(snap.find("Search"), "annual report")
        assert recorder.last_body()["value"] == "annual report"
        assert recorder.last_body()["action"] == "submit"


# --- managed tasks ----------------------------------------------------------
def test_task_streams_steps_then_result(client: Vivid):
    task = client.browser.run(goal="find pricing", url="https://example.com")
    steps = list(task)
    assert [s.action for s in steps] == ["goto", "click"]
    assert steps[1].label == "Pricing"
    assert task.result().answer == "Enterprise is $99/seat."


def test_task_result_without_iterating_drains_first(client: Vivid):
    task = client.browser.run(goal="find pricing", url="https://example.com")
    assert task.result().answer == "Enterprise is $99/seat."
    assert len(task.steps) == 2


def test_task_can_reuse_an_authenticated_session(client: Vivid,
                                                 recorder: Recorder):
    with client.browser.session(storage_state={"cookies": []},
                                allowed_domains=["example.com"]) as s:
        client.browser.run(goal="find the invoice", session=s).result()
    task_body = next(b for b in recorder.bodies if "goal" in b)
    assert task_body["session_id"] == "bs_1"


def test_task_validates_arguments(client: Vivid):
    with pytest.raises(ValueError, match="goal is required"):
        client.browser.run(goal="   ", url="https://example.com")
    with pytest.raises(ValueError, match="url is required"):
        client.browser.run(goal="do a thing")
    with pytest.raises(ValueError, match="max_steps"):
        client.browser.run(goal="x", url="https://e.com", max_steps=99)


# --- retries ----------------------------------------------------------------
def test_capacity_errors_are_retried_for_safe_calls(recorder: Recorder):
    """Listing sessions is a GET: safe to repeat, so a full tier is ridden out
    rather than surfaced."""
    http = httpx.Client(transport=httpx.MockTransport(
        build_handler(recorder, fail_times=1, status=503)))
    with Vivid(api_key="vk_test", base_url="https://api.test",
               http_client=http) as vivid:
        assert vivid.browser.sessions()[0].id == "bs_1"
    assert len(recorder.requests) == 2


def test_actions_are_never_retried(recorder: Recorder):
    """Repeating a click is a second real click. The error surfaces instead."""
    http = httpx.Client(transport=httpx.MockTransport(
        build_handler(recorder, fail_times=1, status=503)))
    with Vivid(api_key="vk_test", base_url="https://api.test",
               http_client=http) as vivid, pytest.raises(CapacityExceeded) as exc:
        vivid.browser.session()
    assert len(recorder.requests) == 1
    assert exc.value.request_id == "req_retry"


# --- async parity -----------------------------------------------------------
async def test_async_session_and_task(async_client):
    async with await async_client.browser.session(
            allowed_domains=["example.com"]) as s:
        await s.goto("https://example.com")
        snap = await s.snapshot()
        await s.type(snap.find("Password"), secret("hunter2"))
        assert (await s.storage_state()) == {"cookies": [{"name": "sid"}]}

    task = async_client.browser.run(goal="find pricing",
                                    url="https://example.com")
    seen = [step async for step in task]
    assert [s.action for s in seen] == ["goto", "click"]
    assert (await task.result()).answer == "Enterprise is $99/seat."


async def test_async_enforces_allowed_domains(async_client):
    with pytest.raises(ValueError, match="allowed_domains is required"):
        await async_client.browser.session(storage_state={"cookies": []})


async def test_async_catches_stale_refs(async_client):
    async with await async_client.browser.session() as s:
        first = await s.snapshot()
        el = first.find("Sign in")
        await s.snapshot()
        with pytest.raises(StaleRef):
            await s.click(el)


def test_redacted_constant_is_not_the_password(client: Vivid):
    assert REDACTED != "hunter2"
