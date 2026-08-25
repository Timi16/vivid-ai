# Vivid Code

A coding agent in your terminal. It writes code in the current folder, starts
the dev server itself, hits its own endpoints, reads the crash logs and fixes
them — then tells you what it built.

```
vivid "make an Express API with GET /quotes returning 3 Nigerian proverbs"
vivid                       # interactive
vivid --dir ./my-site --yolo "build a landing page for a Lagos bakery"
```

## Config

Any of `--url` / `--model`, the `VIVID_URL` / `VIVID_MODEL` env vars, or
`~/.vivid/config.toml`:

```toml
url = "https://your-engine-endpoint/v1"
# model is discovered from the endpoint when omitted
context_budget = 24000
```

Build: `cargo build --release` → `target/release/vivid`.
Install: `cargo install --path .` → `vivid` on your PATH.

## How it works

```
vivid (this binary) ──HTTPS──▶ Vivid Code engine
  loop + all tools run here     stateless token service
```

- `src/agent.rs` — engine → tool calls → run → append → repeat (max 60 steps)
- `src/llm.rs` — streaming client, assembles tool calls
- `src/tools/` — read/write/edit/list/search, bash, start_server / server_logs / http_request / stop_server
- `src/process.rs` — keeps the dev server alive across turns, own process group, log ring buffer
- `prompts/system.md` — Vivid Code's system prompt

Writes and edits apply directly (scoped to the project folder, diff shown).
`bash` asks before running unless `--yolo`. `start_server` never asks.
Set `VIVID_DEBUG=1` to print the engine endpoint and model on startup.
