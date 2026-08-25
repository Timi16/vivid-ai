"""The managed controller loop, and the stale-ref guard around it."""
import json

import pytest

from app.core.errors import APIError
from app.services import browser_sessions as bs
from app.services import browsing


class FakeDriver:
    """Records what the loop asked for, and answers from a script."""

    def __init__(self, snapshots=None):
        self.session_id = "bs_test"
        self.calls: list[tuple] = []
        self._snapshots = snapshots or []
        self.fail_next_act: APIError | None = None

    async def goto(self, url):
        self.calls.append(("goto", url))
        return {"url": url, "title": "Page"}

    async def snapshot(self):
        self.calls.append(("snapshot",))
        if self._snapshots:
            return self._snapshots.pop(0)
        return {"snapshot": "PAGE: Example", "url": "https://example.com",
                "snapshot_id": "snap_x"}

    async def act(self, ref, action, value):
        self.calls.append((action, ref, value))
        if self.fail_next_act is not None:
            error, self.fail_next_act = self.fail_next_act, None
            raise error
        return {"did": f"{action} on '{ref}'", "url": "https://example.com/next"}


def scripted_llm(monkeypatch, decisions):
    """Feed the controller a fixed sequence of decisions."""
    queue = list(decisions)

    async def fake_complete(messages, max_tokens=256, temperature=None):
        return json.dumps(queue.pop(0)) if queue else json.dumps(
            {"action": "done", "answer": "ran out of script"})

    monkeypatch.setattr(browsing.llm, "complete", fake_complete)


async def drain(driver, **kwargs):
    steps, outcome = [], None
    async for event in browsing.run(driver, **kwargs):
        if isinstance(event, browsing.Outcome):
            outcome = event
        else:
            steps.append(event)
    return steps, outcome


# --- the loop ---------------------------------------------------------------
async def test_finishes_when_the_controller_answers(monkeypatch):
    scripted_llm(monkeypatch, [{"action": "done", "answer": "It is $99."}])
    steps, outcome = await drain(FakeDriver(), goal="find the price", max_steps=5)
    assert outcome.answer == "It is $99."
    assert outcome.truncated is False
    assert [s.action for s in steps] == ["done"]


async def test_acts_then_answers(monkeypatch):
    scripted_llm(monkeypatch, [
        {"action": "click", "ref": 3},
        {"action": "done", "answer": "Enterprise is $99/seat."},
    ])
    driver = FakeDriver()
    steps, outcome = await drain(driver, goal="pricing", max_steps=5)
    assert [s.action for s in steps] == ["click", "done"]
    assert ("click", 3, "") in driver.calls
    assert outcome.answer == "Enterprise is $99/seat."


async def test_running_out_of_steps_is_reported_not_hidden(monkeypatch):
    scripted_llm(monkeypatch, [{"action": "click", "ref": 0}] * 10)
    steps, outcome = await drain(FakeDriver(), goal="forever", max_steps=3)
    assert len(steps) == 3
    assert outcome.truncated is True


async def test_a_failed_action_does_not_end_the_run(monkeypatch):
    """A refused click is information the controller can act on. Ending the
    run there would waste the whole budget on one bad guess."""
    scripted_llm(monkeypatch, [
        {"action": "click", "ref": 99},
        {"action": "done", "answer": "recovered"},
    ])
    driver = FakeDriver()
    driver.fail_next_act = APIError(409, "stale_ref", "no element [99]")
    steps, outcome = await drain(driver, goal="x", max_steps=5)
    assert steps[0].ok is False and steps[0].error == "no element [99]"
    assert outcome.answer == "recovered"
    assert outcome.truncated is False


async def test_an_unusable_decision_stops_early(monkeypatch):
    scripted_llm(monkeypatch, [{"action": "levitate"}])
    steps, outcome = await drain(FakeDriver(), goal="x", max_steps=5)
    assert steps == []
    assert outcome.truncated is True


async def test_controller_failure_degrades_to_the_page(monkeypatch):
    async def broken(*a, **k):
        raise browsing.llm.LLMUnavailable("pod is cold")

    monkeypatch.setattr(browsing.llm, "complete", broken)
    _, outcome = await drain(FakeDriver(), goal="x", max_steps=5)
    assert outcome.truncated is True
    assert "PAGE:" in outcome.answer


async def test_invalid_goto_url_is_a_failed_step(monkeypatch):
    scripted_llm(monkeypatch, [
        {"action": "goto", "url": "javascript:alert(1)"},
        {"action": "done", "answer": "done"},
    ])
    driver = FakeDriver()
    steps, _ = await drain(driver, goal="x", max_steps=5)
    assert steps[0].ok is False
    assert "goto" not in [c[0] for c in driver.calls]


async def test_scope_is_named_in_the_controller_prompt(monkeypatch):
    """The driver enforces the boundary regardless — telling the controller
    just saves a step it would otherwise waste being refused."""
    seen = {}

    async def capture(messages, max_tokens=256, temperature=None):
        seen["system"] = messages[0]["content"]
        return json.dumps({"action": "done", "answer": "ok"})

    monkeypatch.setattr(browsing.llm, "complete", capture)
    await drain(FakeDriver(), goal="x", max_steps=3,
                allowed_domains=["example.com"])
    assert "example.com" in seen["system"]


# --- max_steps --------------------------------------------------------------
def test_max_steps_bounds():
    assert browsing.max_steps_for(None) > 0
    assert browsing.max_steps_for(5) == 5
    with pytest.raises(APIError) as exc:
        browsing.max_steps_for(1000)
    assert exc.value.code == "invalid_request"


# --- SessionDriver ----------------------------------------------------------
async def _record(redis, domains=None):
    return await bs.create(redis, owner_id="key_1", user_id="u",
                           allowed_domains=domains, authenticated=False,
                           idle_ttl=None, max_sessions=5)


async def test_session_driver_refuses_off_domain(redis, monkeypatch):
    record = await _record(redis, ["example.com"])
    driver = browsing.SessionDriver(redis, record)
    with pytest.raises(APIError) as exc:
        await driver.goto("https://evil.com")
    assert exc.value.code == "domain_not_allowed"


async def test_session_driver_rejects_a_ref_after_navigation(redis, monkeypatch):
    """Navigating renumbers every ref. Acting on one held across it hits
    whatever now sits at that index — a silent misfire the agent reports as
    success."""
    calls = []

    async def fake_call(path, payload, timeout=40):
        calls.append((path, payload))
        return {"url": "https://example.com", "elements": [], "did": "ok"}

    monkeypatch.setattr(browsing.vivid_tools, "call", fake_call)
    record = await _record(redis)
    driver = browsing.SessionDriver(redis, record)

    await driver.snapshot()
    await driver.goto("https://example.com/other")
    with pytest.raises(APIError) as exc:
        await driver.act(0, "click", "")
    assert exc.value.code == "stale_ref"


async def test_session_driver_rejects_a_stale_snapshot_id(redis, monkeypatch):
    async def fake_call(path, payload, timeout=40):
        return {"url": "https://example.com", "elements": []}

    monkeypatch.setattr(browsing.vivid_tools, "call", fake_call)
    record = await _record(redis)
    driver = browsing.SessionDriver(redis, record)

    first = await driver.snapshot()
    await driver.snapshot()
    with pytest.raises(APIError) as exc:
        await driver.act(0, "click", "", snapshot_id=first["snapshot_id"])
    assert exc.value.code == "stale_ref"


async def test_session_driver_marks_secret_fields(redis, monkeypatch):
    """The value must reach the browser, and the flag must reach the service —
    that flag is what keeps the credential out of every later snapshot."""
    sent = {}

    async def fake_call(path, payload, timeout=40):
        sent.update(payload)
        return {"url": "https://example.com", "elements": [], "did": "typed"}

    monkeypatch.setattr(browsing.vivid_tools, "call", fake_call)
    record = await _record(redis)
    driver = browsing.SessionDriver(redis, record)

    await driver.snapshot()
    await driver.act(1, "type", "hunter2", secret=True)
    assert sent["value"] == "hunter2"
    assert sent["secret"] is True
