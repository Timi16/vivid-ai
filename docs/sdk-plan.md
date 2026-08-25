# Vivid AI SDK — plan

Status: **draft for review, revision 3**. Scope settled, surface near final.

**Decisions taken:** option B — a platform SDK authenticated by API keys.
Primary consumer is another team building **agentic browsing**, including
**authenticated** browsing. Build to scale for a relatively large v1.
Non-blockers are deferred, listed in section 8 rather than dropped.

---

## 1. Read this first: snapshots used to leak typed input values

> **Fixed in P1.** Labels no longer come from `value`; fields are described by
> state (`(secret, empty)`, `(filled)`) instead of quoted. Regression tests:
> `vivid-tools/tests/test_smoke.py`. Kept here because the reasoning is the
> reason several other decisions in this document look the way they do.

In `vivid-tools/app/browser/snapshot.py`, every interactive element got a
label from this fallback chain:

```js
const label = (el.innerText || el.value || el.placeholder ||
               el.getAttribute('aria-label') || el.name || '').trim();
```

`innerText` is empty for `<input>` elements, so **`el.value` wins** — and for a
filled-in field, `value` is what the user typed. After a login form is filled,
the next snapshot renders as:

```
[4] input/password: hunter2
```

That string then travels three places: into the snapshot text returned over
the API, into the LLM controller's prompt on the next step of a `browse` loop,
and into the backend logs (`agent.py` logs tool results, truncated to 120
chars — well within reach of a short password).

Today this is close to harmless: nothing types credentials, because nothing
can log in. **Authenticated browsing is precisely the feature that turns it
into credential disclosure**, so it has to be fixed in the same change, not
after. The fix is small — never use `value` as a label, drop
`type=password`/`autocomplete=current-password` values unconditionally, and
mark fields the SDK filled as secret so their values never re-enter a snapshot.

Related, same class, already flagged in the code: `Connector.token` is stored
in plaintext with a `TODO: encrypt token at rest before real users arrive`.
Persisted browser session state (section 3) is the same kind of bearer
credential and needs solving properly rather than inheriting that TODO.

## 2. What agentic browsing can reach today

The capability is real; the way in is the problem.

`vivid-tools` is a Playwright service — one browser process, one context per
session, isolated cookies and storage, reaped after 10 minutes idle. It
exposes `goto`, `snapshot`, `text`, `act`, `close`. Snapshots are neither
pixels nor raw HTML but a numbered text view: title, headings, up to 2000
chars of body text, up to 40 interactive elements as `[3] input/text: Search`.
That numbered list is a good agent vocabulary, and the SSRF guard blocks
private, loopback, link-local and metadata addresses so a prompt injection
cannot pivot into internal services.

`services/tools.py` layers two tools on top: `browse_page` (one throwaway
session, one page, return the snapshot) and `browse` (snapshot → an LLM
controller picks one action → execute → repeat, capped at 6 steps).

**Neither is reachable on purpose.** The only path is: open a websocket → send
a chat message → `agent.wants_tools()` passes → the planner LLM *elects*
`browse` from twelve tools → the result is folded into prose. A developer
cannot say "browse this page." For a team whose whole use case is browsing,
that is the blocker that matters most.

## 3. Authenticated browsing

The requirement changes the security model more than it changes the API, so
the design matters more than the endpoint list.

### The rule: credentials never reach the model

Three ways to get an authenticated session, in descending order of safety:

**Storage-state injection (recommended for v1).** The caller supplies a
previously-captured cookie/localStorage blob; we pass it to
`browser.new_context(storage_state=...)`, which Playwright supports natively.
No credential ever reaches Vivid or the model. On close, the updated state is
returned so the caller can persist a refreshed session. This is Playwright's
own recommended auth pattern and it is the cheapest thing to build.

**Developer-scripted login (also v1).** Some sites cannot be pre-captured. The
developer drives the login through layer-1 control, and the SDK marks the
credential values as secret: they go straight to Playwright, are never
rendered into a snapshot, never enter a controller prompt, and are redacted in
logs and in the `did` string `act()` returns. The agent loop only starts
*after* authentication is established.

**Model-typed credentials — not offered.** If the LLM controller is the thing
typing a password, then any page it visits can steer it, because the
controller's entire input is attacker-influenced page text. That is credential
exfiltration with extra steps, and no amount of prompting fixes it. The two
options above cover the real use cases, so this is a design position rather
than a limitation.

### Domain scoping is not optional here

An authenticated context carries live session cookies. The SSRF guard stops
the agent reaching internal addresses, but nothing stops it navigating to
`evil.com` *while holding those cookies* — and the controller decides
navigation from page content, which an attacker can write.

So an authenticated session must be created with an allowed-domain list, and
navigation outside it refused at the service:

```py
vivid.browser.session(storage_state=state, allowed_domains=["example.com"])
```

For unauthenticated sessions this stays optional. For authenticated ones it
should be required — a session holding credentials with no egress limit is a
credential-theft primitive waiting for one bad page.

### Persisted profiles — v1.1, not v1

Storing storage-state server-side keyed to an API key ("profiles") is the
nicer developer experience and the obvious next step. It needs encryption at
rest, rotation, and an expiry story, and it is not required for the SDK to be
useful. Ship injection first; add profiles once there is a real encryption
story that also retires the `Connector.token` TODO.

## 4. Scale

"Relatively large v1" changes vivid-tools from a single container into a tier.
Current shape: one browser process, contexts held in an in-process dict,
`max_sessions = 8`, and — the sharp edge — when the pool is full,
`pool.session()` **silently closes the oldest session** to make room.

That LRU is defensible while our own backend is the only caller. It is not
defensible now, for two compounding reasons: a second team's traffic would
silently destroy the chat product's in-flight sessions and vice versa, and
with authentication an evicted session means a *lost login*, not just a lost
page. The next call fails with `no element [n]; take a fresh snapshot`, which
explains nothing.

The target shape:

- **Admission control, not eviction.** At capacity, queue or reject with an
  explicit `capacity_exceeded`. Never silently discard a live session.
- **Per-key quotas** on concurrent sessions, enforced before the pool is asked,
  so no single consumer can starve the tier.
- **A session registry in Redis** — `session_id → replica`, with server-issued
  ids. Sessions are in-process state, so the backend has to route each call to
  the replica that owns it; replicas drain rather than terminate on scale-down.
- **Separate deployments** for SDK and chat traffic, so the two workloads
  cannot starve each other even if quotas are misconfigured.
- **Sizing from memory, which is the binding constraint.** ~150–250MB per
  context means roughly 16–20 contexts per 4GB replica with headroom;
  concurrency target ÷ ~16 gives the replica count. Worth confirming against a
  real measurement early in P2 rather than trusting that range.
- **Longer, per-key idle TTL.** 10 minutes is short for an authenticated
  session a developer means to reuse across tasks.

Two things to decide during P2 rather than now: whether a hostile page
crashing the shared browser process (contexts share one Chromium) needs
browser-per-tenant isolation, and whether egress needs a proxy tier.

## 5. Blockers

| # | Blocker | Fix |
|---|---|---|
| B1 | No API keys | `api_keys` table keyed to `client_id`, `vk_` prefix, resolved in `api/deps.py` beside the JWT path |
| B2 | Browsing has no deterministic entry point | `/v1/browser/*` session routes + `POST /v1/browser/tasks` |
| B3 | Capacity: 8 sessions service-wide, silent LRU eviction | Section 4 in full |
| B4 | Refs resolve by fuzzy text match — two "Read more" links both hit the first | Store a stable handle/selector per element at snapshot time; act on that |
| B5 | Session ids are a flat unauthenticated namespace — any caller can drive any session | Server-issued ids, namespaced by owning key |
| B6 | Snapshots leak typed input values | Section 1 |
| B7 | Authenticated sessions have unrestricted egress | Required `allowed_domains` on authenticated sessions |

Cheap and worth doing in the same pass: a REST error envelope
(`{"error": {"code", "message", "request_id"}}`) — one exception handler, no
route changes. Browsing needs distinguishable failures (`nav_timeout`,
`blocked_url`, `capacity_exceeded`, `stale_ref`, `quota_exceeded`,
`domain_not_allowed`) or the consuming team cannot decide what to retry.

## 6. SDK surface

Browsing first. Python shown; TypeScript mirrors it.

```py
vivid = Vivid(api_key="vk_...")

# --- layer 1: you drive -------------------------------------------------
with vivid.browser.session(
        storage_state=saved_state,             # optional; authenticated
        allowed_domains=["example.com"],       # required when authenticated
) as s:
    s.goto("https://example.com/app")
    snap = s.snapshot()                        # url, title, headings, text,
                                               # elements[]
    s.click(snap.find("Reports"))              # ref helper, not a raw int
    s.submit(snap.find("Search"), "Q3")
    body = s.text(selector="main")
    saved_state = s.storage_state()            # refreshed, to persist

# scripted login, when state cannot be pre-captured
with vivid.browser.session(allowed_domains=["example.com"]) as s:
    s.goto("https://example.com/login")
    snap = s.snapshot()
    s.type(snap.find("Email"), "bot@example.com")
    s.type(snap.find("Password"), secret(password))   # never snapshotted,
    s.click(snap.find("Sign in"))                     # never in a prompt

# --- layer 2: Vivid drives ---------------------------------------------
task = vivid.browser.run(
    goal="find the enterprise pricing tier",
    url="https://example.com",
    max_steps=8,
    session=s,                                 # optional: reuse an authed one
)
for step in task:                              # structured, not status strings
    print(step.action, step.label, step.url)
answer = task.result()                         # text + the trail that made it
```

Choices worth arguing about now:

- **`session()` is a context manager.** Contexts are ~200MB against a quota;
  leaking them is the default failure mode of every browser API.
- **`secret(...)` is a distinct type, not a string.** It is what makes "never
  snapshot this, never prompt with this, redact in logs" enforceable rather
  than a documentation promise.
- **`snap.find("Sign in")` over raw ref integers.** Refs are positional and
  invalidate on every snapshot (B4); holding the snapshot that produced a ref
  lets the SDK reject a stale one client-side with a clear message.
- **`task.result()` returns the answer *and* the trail.** The action sequence
  is the debuggable part of an agent loop.
- **Typed exceptions** from the error codes above — `QuotaExceeded`,
  `CapacityExceeded`, `StaleRef`, `BlockedUrl`, `DomainNotAllowed`,
  `NavTimeout` — so retry logic is writable.

## 7. Backend work

| # | Change | Where | For |
|---|---|---|---|
| 1 | `api_keys` table, resolution beside JWT | `db/models.py`, `api/deps.py` | B1 |
| 2 | Server-issued, key-scoped session ids + Redis registry | `vivid-tools/browser/pool.py`, backend routes | B5, B3 |
| 3 | `/v1/browser/*` session routes | new `api/routes/browser.py` | B2 |
| 4 | `POST /v1/browser/tasks` — the `browse` loop as an endpoint, `max_steps` param, structured step events | extract `tools.py:tool_browse` into `services/browsing.py` | B2 |
| 5 | Stable element handles at snapshot time | `vivid-tools/browser/{snapshot,service}.py` | B4 |
| 6 | Never label from `value`; drop password values; secret-field marking | `vivid-tools/browser/snapshot.py` | B6 |
| 7 | `storage_state` in/out on session create/close | `vivid-tools/browser/pool.py` | auth |
| 8 | `allowed_domains` enforcement on navigate and on controller `goto` | `vivid-tools/security.py`, `services/browsing.py` | B7 |
| 9 | Admission control, per-key quotas, explicit capacity errors | `vivid-tools/browser/pool.py` | B3 |
| 10 | Separate deployment + horizontal scaling with session affinity | `docker-compose.yml`, infra | B3 |
| 11 | REST error envelope with browse-specific codes | `main.py` handler | — |

Item 4 matters beyond the SDK: extracting the controller loop means the chat
tool and the SDK endpoint share one implementation. If they fork, they drift,
and the chat product is the one that quietly gets worse.

## 8. Explicitly deferred

Parked, not dropped: voice in the SDK; a stateless `POST /responses`; SSE as
an alternative to the websocket; pagination cursors, idempotency keys and
rate-limit headers; connectors; `vivid-frontend` adopting the SDK; websocket
header auth; server-side persisted browser profiles (section 3).

## 9. Contract and testing

- `sdk/spec/openapi.json` snapshotted from FastAPI in CI; a diff without a
  matching SDK change fails the build. Browsing is REST, so unlike revision 1
  the contract is almost entirely expressible in OpenAPI.
- **The SDK is the smoke test** — `make smoke` already drives a full
  signup → chat → upload → turn → delete cycle; add a browsing equivalent
  written on the SDK.
- **A fixture site, not live targets.** Real pages change under you and make
  CI flaky. A static site served in-compose, including a login form, with
  `allow_private_hosts` flipped for that test profile only.
- **Security tests are first-class here**, and each maps to a blocker: a
  password typed into a form never appears in any snapshot, log line or
  controller prompt (B6); a session with `allowed_domains` refuses off-domain
  navigation including one the controller chooses (B7); a session id belonging
  to another key is rejected (B5); capacity pressure queues rather than
  evicting a live session (B3).

## 10. Sequencing

| Phase | Deliverable | Size | Status |
|---|---|---|---|
| P0 | Contract: API-key design, browser routes, error codes, auth model sign-off. | 2–3 days | **done** — encoded as tests |
| P4 | SDK: browsing-first, Python and TypeScript. | ~1 week | **done** — `sdk/`, 105 tests |
| P1 | Backend: API keys, session tenancy, `/v1/browser/*`, tasks endpoint, error envelope. | ~1.5 weeks | **done** — 75 tests |
| P2 | vivid-tools: snapshot leak fix, stable selectors, `storage_state`, domain scoping, admission control. | ~1.5 weeks | **mostly done** — see below |
| P3 | Scale-out: separate deployment, session registry, affinity routing, load test to the concurrency target. | ~1.5 weeks | next |
| P5 | Hand-off: quickstart, examples, versioning policy, publishing. | ~3 days | examples written; publishing pending |

**P2 landed early, in part.** Four of its items were prerequisites for P1
rather than follow-ups, so they shipped with it: the snapshot credential leak
(B6), stable CSS selectors replacing text matching (B4), `storage_state`
support, and domain scoping (B7). The pool now refuses at capacity instead of
evicting (B3), and per-key quotas are enforced in the backend.

What remains of P2/P3 is genuinely infrastructure: a separate vivid-tools
deployment for partner traffic, replicas with session affinity, and a load test
against the real concurrency target. Sessions are still in-process state in a
single container, so today's ceiling is `BROWSER_max_sessions = 8` for
everyone.

The SDK was built ahead of the backend deliberately. Writing the client first
turned the contract from prose into 105 executable tests, which is a cheaper
place to discover a bad shape than after the endpoints exist — and it means P1
has an exact specification to build against rather than a section of this
document. Both packages call `/v1/browser/*`, which returns 404 until P1 lands.

P2 and P3 split what revision 2 had as one phase, because authenticated
browsing added real work to both. P3 is the estimate I trust least: it depends
on how you deploy today, which I have not seen — there is nothing in the repo
beyond `docker-compose.yml`.

## 11. Remaining questions

1. **Which language first?** Both are planned; whichever the other team holds
   on day one should lead.
2. **What concurrency number sizes P3?** "Large" needs a figure to load-test
   against — 50 concurrent sessions and 500 are different tiers.
3. **What is missing from the action vocabulary?** Today it is
   `click | type | submit`. No back/forward, scroll, `select` for dropdowns,
   waiting for a selector, file upload, downloads, or screenshots.
   Authenticated flows tend to need `select` and waiting almost immediately.
4. **How do you deploy today?** P3's shape depends entirely on it.
