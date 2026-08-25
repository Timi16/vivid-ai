# vivid-ai (Python)

Python SDK for Vivid AI — agentic browsing, chats, files and search.

```bash
pip install vivid-ai
```

Requires Python 3.10+. The only dependency is `httpx`.

> **Status:** the browsing endpoints (`/v1/browser/*`) and API-key auth are
> implemented — backend phase P1. A contract test drives this SDK against the
> real routes in `vivid-backend/tests/test_sdk_contract.py`. Mint a key with
> `python -m app.scripts.create_api_key "your team"`.

## Quick start

```python
from vivid_ai import Vivid

vivid = Vivid(api_key="vk_...")          # or set VIVID_API_KEY

task = vivid.browser.run(
    goal="find the enterprise pricing tier",
    url="https://example.com",
    max_steps=8,
)
for step in task:
    print(step)                          # 1. goto -> https://example.com
print(task.result().answer)
```

## The two layers

**You drive.** Full control, no model in the loop unless you put one there.

```python
with vivid.browser.session() as s:
    s.goto("https://example.com")
    snap = s.snapshot()                  # title, headings, text, elements
    s.submit(snap.find("Search"), "annual report")
    print(s.text(selector="main"))
```

**Vivid drives.** Snapshot, decide, act, repeat — until it can answer.

```python
task = vivid.browser.run(goal="...", url="...")
answer = task.result().answer
```

They compose: authenticate with layer 1, then hand the session to layer 2.

```python
with vivid.browser.session(allowed_domains=["example.com"]) as s:
    login(s)
    result = vivid.browser.run(goal="download the latest invoice",
                               session=s).result()
```

## Authenticated browsing

Two supported routes, and one deliberate omission.

**Replay saved state** — no credential ever reaches Vivid:

```python
with vivid.browser.session(storage_state=saved,
                           allowed_domains=["example.com"]) as s:
    s.goto("https://example.com/app")
    saved = s.storage_state()            # refreshed; persist it yourself
```

**Script the login** when state can't be pre-captured. Wrap credentials in
`secret()` — the value goes straight to the browser and never enters a
snapshot, a controller prompt, or a log line:

```python
from vivid_ai import secret

with vivid.browser.session(allowed_domains=["example.com"]) as s:
    s.goto("https://example.com/login")
    snap = s.snapshot()
    s.type(snap.find("Email"), "bot@example.com")
    s.type(snap.find("Password"), secret(os.environ["APP_PASSWORD"]))
    s.click(snap.find("Sign in"))
```

`Secret` redacts itself in `repr`, `str`, f-strings and log output, so the
realistic leak — someone's own debug logging — is closed too. Reading the value
takes an explicit `.reveal()`, which is greppable in review.

**Not offered: letting the model type credentials.** A managed task's entire
input is page text an attacker can write, so a controller holding a password is
one crafted page away from exfiltrating it. The two routes above cover the real
cases.

### `allowed_domains` is required when authenticated

An authenticated session carries live cookies. The SSRF guard stops it reaching
internal addresses, but nothing stops it navigating to an attacker's page
*while holding those cookies*. So passing `storage_state` without
`allowed_domains` raises immediately:

```python
vivid.browser.session(storage_state=saved)
# ValueError: allowed_domains is required for an authenticated session...
```

The restriction covers every navigation in the session, including ones a
managed task chooses.

## Working with snapshots

A snapshot is the page as the agent sees it — not pixels, not raw HTML, but
title, headings, text, and numbered interactive elements.

```python
snap = s.snapshot()
snap.find("Sign in")                     # ranked: exact > prefix > substring
snap.find("Password", kind="input/password")
snap.find_all("Download")
```

`find` ranks rather than taking the first substring hit, so a link labelled
"Search products" doesn't beat the button labelled "Search". A miss raises
`ElementNotFound` listing what the page actually offered.

**Refs are positional and expire.** Every snapshot renumbers them, so a ref
held across one points at whatever now sits at that index. The SDK tracks which
snapshot is current and refuses stale refs before they reach the wire:

```python
snap = s.snapshot()
button = snap.find("Sign in")
s.snapshot()                             # invalidates `snap`
s.click(button)                          # StaleRef: take a fresh snapshot
```

## Errors

Every failure has its own class, because the right response differs:

| Exception | Meaning | What to do |
|---|---|---|
| `StaleRef` | Ref came from an older snapshot | Re-snapshot, find again |
| `CapacityExceeded` | The browser tier is full | Back off and retry |
| `QuotaExceeded` | Your key holds its max sessions | Close sessions first |
| `DomainNotAllowed` | Navigation outside `allowed_domains` | Fix the target, or widen the list |
| `BlockedUrl` | SSRF guard: private/loopback/metadata | Don't retry |
| `SessionExpired` | Reaped after idle TTL | Open a new session |
| `NavTimeout` | Page didn't load in time | Retry once |
| `RateLimited` | Too many requests | Honour `.retry_after` |

All inherit `VividError`; browsing ones also inherit `BrowserError`. An unknown
code from a newer server degrades to `APIError` rather than breaking.

Safe requests (GETs) are retried automatically with jittered backoff. **Actions
are never retried** — repeating a click is a second real click.

## Async

Same surface, awaited:

```python
from vivid_ai import AsyncVivid

async with AsyncVivid(api_key="vk_...") as vivid:
    async with await vivid.browser.session() as s:
        await s.goto("https://example.com")
        snap = await s.snapshot()

    task = vivid.browser.run(goal="...", url="...")
    async for step in task:
        print(step)
    print((await task.result()).answer)
```

## Other resources

```python
vivid.chats.create(language="en")
vivid.chats.list(limit=50)
vivid.chats.messages(chat_id)
vivid.chats.update(chat_id, title="Renamed", pinned=True)

vivid.attachments.upload("report.pdf", chat_id=chat_id)   # path, bytes or file
vivid.artifacts.list()                                     # what Vivid generated
vivid.search("fuel prices")
vivid.health.models()
```

Attachment and artifact URLs are presigned for about an hour. Hold the id and
re-fetch when you need a link; don't store the link.

Streaming a chat turn is not here yet: it runs over the websocket, which still
authenticates a user JWT from a query parameter and cannot accept an API key.
It arrives with that change.

## Configuration

| Argument | Env | Default |
|---|---|---|
| `api_key` | `VIVID_API_KEY` | — (required) |
| `base_url` | `VIVID_BASE_URL` | `http://localhost:8000` |
| `timeout` | — | 60s (120s for browsing) |
| `max_retries` | — | 2 |
| `http_client` | — | built for you |

A supplied `http_client` is still authenticated — passing one means "use my
proxy or CA bundle", not "skip auth".

## Development

```bash
pip install -e ".[dev]"
pytest
```

Tests run against an in-process mock of the API, so no stack is needed.
