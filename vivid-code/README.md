# Vivid Code

A coding agent in your terminal. It writes code in the current folder, starts
the dev server itself, hits its own endpoints, reads the crash logs and fixes
them — then tells you what it built.

```
vivid "make an Express API with GET /quotes returning 3 Nigerian proverbs"
vivid                       # interactive
vivid --dir ./my-site --yolo "build a landing page for a Lagos bakery"
```

## Sign in

Vivid Code reaches models through the Vivid backend, not a pod, so it needs a
Vivid account:

```
vivid --login                 # paste a Vivid API key (vk_…)
echo vk_… | vivid --login     # non-interactive, for CI
vivid --logout
```

The key is verified against `/auth/me` before it is stored, and it lands in
`~/.vivid/auth.toml` with owner-only permissions. `VIVID_TOKEN` overrides the
stored key for a single run. Mint a key from the backend:

```
docker compose exec backend python -m app.scripts.create_api_key "Timi's laptop"
```

## Config

Any of `--url` / `--model`, the `VIVID_URL` / `VIVID_MODEL` env vars, or
`~/.vivid/config.toml`:

```toml
url = "https://your-vivid-backend/v1"   # default: http://localhost:8000/v1
# model is discovered from the endpoint when omitted, and the backend's
# default is `vivid-code`. `vivid-chat` is the assistant model.
context_budget = 24000
```

There is no pod address here. The backend resolves `vivid-code` to whichever
RunPod endpoint currently serves it, so a pod move needs no new binary, and
every call is attributed to an account.

Build: `cargo build --release` → `target/release/vivid`.
Install: `cargo install --path .` → `vivid` on your PATH.

## How it works

```
vivid (this binary) ──HTTPS+Bearer──▶ Vivid backend /v1 ──▶ RunPod pod
  loop + all tools run here            auth, model alias,     stateless
                                       rate limit, usage      token service
```

- `src/agent.rs` — engine → tool calls → run → append → repeat (max 60 steps)
- `src/llm.rs` — streaming client, assembles tool calls
- `src/tools/` — read/write/edit/list/search, bash, start_server / server_logs / http_request / stop_server
- `src/process.rs` — keeps the dev server alive across turns, own process group, log ring buffer
- `prompts/system.md` — Vivid Code's system prompt

Writes and edits apply directly (scoped to the project folder, diff shown).
`bash` asks before running unless `--yolo`. `start_server` never asks.
Set `VIVID_DEBUG=1` to print the engine endpoint and model on startup.

## Machine-readable mode (`--json`)

`vivid --json` replaces the TUI with newline-delimited JSON: one event object
per line on stdout, one request object per line on stdin. This is how the
[VS Code extension](../vivid-vscode) drives it, and it is a stable contract —
anything that can spawn a process can be a front end.

stdout is the protocol. Panics and tracing go to stderr, so they never corrupt
the event stream.

**Events out**

| `type` | Carries |
| --- | --- |
| `ready` | `root`, `version` — the engine resolved and the agent is usable |
| `token` | `text` — one chunk of the assistant's reply, unrendered |
| `reply_end` | the reply is complete |
| `busy` | `label` — what it is doing now |
| `tool_call` | `name`, `args` |
| `tool_result` | `text` |
| `diff` | `path`, `old`, `new` — both sides, so the front end renders its own |
| `approval_request` | `id`, `question`, `detail` — **the loop blocks on this** |
| `usage` | `prompt`, `completion`, `budget` |
| `info` / `warn` / `error` | `message` (`error` also carries `code`) |
| `turn_end` | `ok` — one turn finished; send the next prompt |

**Requests in**

```json
{"type": "prompt",   "text": "add a /health route"}
{"type": "approval", "id": 1, "ok": true}
{"type": "cancel"}
{"type": "quit"}
```

`cancel` is cooperative: it is checked at the step boundary, so a tool already
running finishes and the conversation is never left with an unanswered
`tool_call` (which the engine would reject on the next turn).

### Approval is not optional here

`ui::confirm` returns `true` whenever the session is not interactive — correct
for `vivid "one shot"` at a terminal, and wrong for anything headless, where it
would run every command the model asks for with nobody watching. In `--json`
mode the question goes to the front end instead and the loop waits for a real
answer. A closed stdin denies.

Do not combine `--json` with `--yolo`: the flag skips the question entirely,
which defeats the point of routing it.
