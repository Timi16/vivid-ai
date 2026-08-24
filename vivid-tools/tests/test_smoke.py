"""Smoke tests that run without a live browser: URL guard and snapshot
formatting are pure logic, so they cover the pieces most likely to regress."""
from app.browser.snapshot import format_snapshot
from app.security import is_allowed_url


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
            {"tag": "input", "type": "text", "label": "Search"},
        ],
    }
    text, elements = format_snapshot(raw)
    assert "[0] a: Home" in text
    assert "[1] input/text: Search" in text
    assert len(elements) == 2
