# @vivid-ai/sdk

TypeScript SDK for Vivid AI — agentic browsing, chats, files and search.

```bash
npm install @vivid-ai/sdk
```

Node 18+, Deno, Bun or workers. Built on global `fetch`, with no runtime
dependencies.

> **Status:** the browsing endpoints (`/v1/browser/*`) and API-key auth are
> implemented — backend phase P1. A contract test drives this SDK against the
> real routes in `vivid-backend/tests/test_sdk_contract.py`. Mint a key with
> `python -m app.scripts.create_api_key "your team"`.

## Quick start

```ts
import { Vivid, formatStep } from "@vivid-ai/sdk";

const vivid = new Vivid({ apiKey: "vk_..." });   // or set VIVID_API_KEY

const task = vivid.browser.run({
  goal: "find the enterprise pricing tier",
  url: "https://example.com",
  maxSteps: 8,
});
for await (const step of task) console.log(formatStep(step));
console.log((await task.result()).answer);
```

## The two layers

**You drive.** Full control, no model in the loop unless you put one there.

```ts
const session = await vivid.browser.session();
try {
  await session.goto("https://example.com");
  const snap = await session.snapshot();
  await session.submit(snap.find("Search"), "annual report");
  console.log(await session.text("main"));
} finally {
  await session.close();
}
```

**Vivid drives.** Snapshot, decide, act, repeat — until it can answer.

```ts
const { answer } = await vivid.browser.run({ goal: "...", url: "..." }).result();
```

They compose: authenticate with layer 1, then hand the session to layer 2.

```ts
const session = await vivid.browser.session({ allowedDomains: ["example.com"] });
await login(session);
const result = await vivid.browser
  .run({ goal: "download the latest invoice", session })
  .result();
```

Where your runtime supports explicit resource management, `await using` closes
the session for you:

```ts
await using session = await vivid.browser.session();
await session.goto("https://example.com");
```

## Authenticated browsing

Two supported routes, and one deliberate omission.

**Replay saved state** — no credential ever reaches Vivid:

```ts
const session = await vivid.browser.session({
  storageState: saved,
  allowedDomains: ["example.com"],
});
await session.goto("https://example.com/app");
saved = await session.storageState();   // refreshed; persist it yourself
```

**Script the login** when state can't be pre-captured. Wrap credentials in
`secret()` — the value goes straight to the browser and never enters a
snapshot, a controller prompt, or a log line:

```ts
import { secret } from "@vivid-ai/sdk";

const session = await vivid.browser.session({ allowedDomains: ["example.com"] });
await session.goto("https://example.com/login");
const snap = await session.snapshot();
await session.type(snap.find("Email"), "bot@example.com");
await session.type(snap.find("Password"), secret(process.env.APP_PASSWORD!));
await session.click(snap.find("Sign in"));
```

`Secret` renders as `***` through `toString`, template literals, `console.log`
and — most importantly — `JSON.stringify`, which is where credentials usually
escape. Reading the value takes an explicit `.reveal()`, greppable in review.

**Not offered: letting the model type credentials.** A managed task's entire
input is page text an attacker can write, so a controller holding a password is
one crafted page away from exfiltrating it. The two routes above cover the real
cases.

### `allowedDomains` is required when authenticated

An authenticated session carries live cookies. The SSRF guard stops it reaching
internal addresses, but nothing stops it navigating to an attacker's page
*while holding those cookies*. So passing `storageState` without
`allowedDomains` throws immediately:

```ts
await vivid.browser.session({ storageState: saved });
// Error: allowedDomains is required for an authenticated session...
```

The restriction covers every navigation in the session, including ones a
managed task chooses.

## Working with snapshots

A snapshot is the page as the agent sees it — not pixels, not raw HTML, but
title, headings, text, and numbered interactive elements.

```ts
const snap = await session.snapshot();
snap.find("Sign in");                        // ranked: exact > prefix > substring
snap.find("Password", { kind: "input/password" });
snap.findAll("Download");
```

`find` ranks rather than taking the first substring hit, so a link labelled
"Search products" doesn't beat the button labelled "Search". A miss throws
`ElementNotFound` listing what the page actually offered.

**Refs are positional and expire.** Every snapshot renumbers them, so a ref
held across one points at whatever now sits at that index. The SDK tracks which
snapshot is current and refuses stale refs before they reach the wire:

```ts
const snap = await session.snapshot();
const button = snap.find("Sign in");
await session.snapshot();                    // invalidates `snap`
await session.click(button);                 // StaleRef: take a fresh snapshot
```

## Errors

Every failure has its own class, because the right response differs:

| Error | Meaning | What to do |
|---|---|---|
| `StaleRef` | Ref came from an older snapshot | Re-snapshot, find again |
| `CapacityExceeded` | The browser tier is full | Back off and retry |
| `QuotaExceeded` | Your key holds its max sessions | Close sessions first |
| `DomainNotAllowed` | Navigation outside `allowedDomains` | Fix the target, or widen the list |
| `BlockedUrl` | SSRF guard: private/loopback/metadata | Don't retry |
| `SessionExpired` | Reaped after idle TTL | Open a new session |
| `NavTimeout` | Page didn't load in time | Retry once |
| `RateLimited` | Too many requests | Honour `.retryAfter` |

All extend `VividError`; browsing ones also extend `BrowserError`. An unknown
code from a newer server degrades to `APIError` rather than breaking.

Safe requests (GETs) are retried automatically with jittered backoff. **Actions
are never retried** — repeating a click is a second real click.

## Other resources

```ts
await vivid.chats.create({ language: "en" });
await vivid.chats.list({ limit: 50 });
await vivid.chats.messages(chatId);
await vivid.chats.update(chatId, { title: "Renamed", pinned: true });

await vivid.attachments.upload(file, { chatId });   // Blob, bytes or string
await vivid.artifacts.list();                        // what Vivid generated
await vivid.search("fuel prices");
await vivid.health.models();
```

Attachment and artifact URLs are presigned for about an hour. Hold the id and
re-fetch when you need a link; don't store the link.

Streaming a chat turn is not here yet: it runs over the websocket, which still
authenticates a user JWT from a query parameter and cannot accept an API key.
It arrives with that change.

## Configuration

| Option | Env | Default |
|---|---|---|
| `apiKey` | `VIVID_API_KEY` | — (required) |
| `baseUrl` | `VIVID_BASE_URL` | `http://localhost:8000` |
| `timeout` | — | 60000ms (120000 for browsing) |
| `maxRetries` | — | 2 |
| `fetch` | — | global `fetch` |

Supply `fetch` to route through a proxy agent, or to inject a test double.

## Development

```bash
npm install
npm test          # vitest against an in-process mock of the API
npm run typecheck
npm run build
```
