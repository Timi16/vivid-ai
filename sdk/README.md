# Vivid AI SDKs

Client libraries for the Vivid platform API, built browsing-first for partner
teams. Plan and rationale: [`../docs/sdk-plan.md`](../docs/sdk-plan.md).

| Package | Language | Path |
|---|---|---|
| `vivid-ai` | Python 3.10+ | [`python/`](python/) |
| `@vivid-ai/sdk` | TypeScript / Node 18+ | [`typescript/`](typescript/) |

Both expose the same surface and the same guarantees; each is idiomatic in its
own language rather than a transliteration of the other.

## Status

The browsing endpoints (`/v1/browser/*`) and API-key authentication are
**implemented** (backend phase P1). `vivid-backend/tests/test_sdk_contract.py`
drives the Python SDK against the real routes over an ASGI transport, so a
field rename or a status-code change on either side fails a test rather than a
partner's integration.

Mint a key with `python -m app.scripts.create_api_key "your team"`.

Chat *streaming* is absent from both by design. It runs over the websocket,
which still decodes a user JWT from a query parameter and cannot accept an API
key; it arrives with that change.

## Design decisions worth knowing

These are the parts a reviewer should push on, since they are the ones that
would be expensive to change after the other team builds on them.

**Sessions are scoped resources.** A browser context is ~200MB and counts
against a per-key quota, so both SDKs make the lifetime explicit — a context
manager in Python, `close()`/`await using` in TypeScript — and close the
session even when the body throws.

**Stale element refs are caught client-side.** Refs are positional and
regenerate on every snapshot, so one held across a snapshot or a navigation
points at whatever now occupies that index. Both SDKs track the current
snapshot and refuse a stale ref before it reaches the wire, turning a silent
misfire into a clear error.

**Credentials are a type, not a convention.** `secret(...)` redacts itself
through every printing path — including `JSON.stringify` in TypeScript, which
is where credentials usually escape — and reading it takes an explicit
`.reveal()`. It also sets the flag that tells the browser service to mark the
field so its value never re-enters a snapshot.

**Authenticated sessions must declare their domains.** Passing `storage_state`
without `allowed_domains` raises at the call site. A session holding live
cookies with unrestricted egress is a credential-theft primitive, and the
controller picks navigation from page text an attacker can write.

**Actions are never retried.** Safe requests get jittered backoff; a click does
not, because repeating it is a second real click.

**Unknown error codes degrade rather than break.** A code added server-side
becomes `APIError`, so an installed SDK keeps working against a newer API.

## Tests

```bash
cd python     && pip install -e ".[dev]" && pytest      # 57 tests
cd typescript && npm install && npm test                # 48 tests
```

Both suites run against an in-process mock, so no stack is required. They cover
ranking, staleness, redaction, retry policy and error mapping — the behaviour a
live server would make slow and flaky to check.

Integration against a real stack belongs in the compose smoke test; see the
plan's section 9.
