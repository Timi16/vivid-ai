"""Smoke tests that run without a live browser: the URL guard, domain scoping
and snapshot formatting are pure logic, so they cover the pieces most likely
to regress."""
import pytest

from app.browser.snapshot import SNAPSHOT_JS, format_snapshot
from app.security import host_allowed, is_allowed_url


def test_blocks_private_and_bad_urls():
    assert not is_allowed_url("http://127.0.0.1:8005/health")
    assert not is_allowed_url("http://localhost/admin")
    assert not is_allowed_url("http://169.254.169.254/latest/meta-data/")
    assert not is_allowed_url("file:///etc/passwd")
    assert not is_allowed_url("not a url")


def test_allows_public_urls():
    assert is_allowed_url("https://example.com")


def test_format_snapshot_numbers_elements():
    raw = {
        "title": "T", "url": "https://example.com",
        "headings": ["Hello"],
        "text": "some page text",
        "elements": [
            {"tag": "a", "type": "", "label": "Home"},
            {"tag": "input", "type": "text", "label": "Search (empty)"},
        ],
    }
    text, elements = format_snapshot(raw)
    assert "[0] a: Home" in text
    assert "[1] input/text: Search (empty)" in text
    assert len(elements) == 2


# --- credential leak regression ---------------------------------------------
# The snapshot builder runs in the page, so its behaviour cannot be exercised
# without a real browser. These assertions are therefore on the source itself:
# crude, but they pin the exact mistake that was there, which a live-browser
# test in CI would be too slow and too easy to skip to catch reliably.

def test_snapshot_never_labels_an_element_with_its_value():
    """`el.innerText || el.value || ...` was the label chain, and innerText is
    empty for <input> — so a filled password field rendered as
    `[4] input/password: hunter2`, which then went into the snapshot text, the
    controller's next prompt, and the logs. Nothing typed credentials at the
    time; authenticated browsing is what would have made it fire."""
    assert "el.value ||" not in SNAPSHOT_JS
    assert "el.innerText || el.placeholder" in SNAPSHOT_JS


def test_snapshot_describes_field_state_instead_of_reading_it():
    for marker in ("(secret, filled)", "(secret, empty)", "(filled)", "(empty)"):
        assert marker in SNAPSHOT_JS


def test_snapshot_recognises_secret_fields():
    assert "password" in SNAPSHOT_JS
    assert "one-time-code" in SNAPSHOT_JS
    # Caller-supplied marks matter too: a site may hide its password field
    # behind a custom widget that looks like an ordinary text input.
    assert "secretRefs" in SNAPSHOT_JS


# --- domain scoping ---------------------------------------------------------
@pytest.mark.parametrize("url,allowed", [
    ("https://example.com/app", True),
    ("https://api.example.com", True),
    ("https://evil.com", False),
    ("https://example.com.evil.com", False),
    ("https://notexample.com", False),
    ("garbage", False),
])
def test_host_allowed(url, allowed):
    assert host_allowed(["example.com"], url) is allowed


def test_empty_allowlist_is_unrestricted():
    assert host_allowed([], "https://anywhere.example") is True


def test_elements_carry_a_stable_selector():
    """Acting used to locate by visible text, so two "Read more" links both
    resolved to the first. Describing fields by state rather than value made
    text matching wrong outright, since the label is no longer page text."""
    assert "cssPath" in SNAPSHOT_JS
    assert "selector: cssPath(el)" in SNAPSHOT_JS
    assert "nth-of-type" in SNAPSHOT_JS
