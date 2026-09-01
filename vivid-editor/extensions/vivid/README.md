# Vivid Code for VS Code

The agent from [`vivid-code`](../vivid-code) in the editor. The extension does
not talk to a model or a backend: it spawns the local `vivid` binary with
`--json` and speaks NDJSON over its pipes.

```
VS Code extension ──stdin/stdout──▶ vivid --json ──▶ Devstral (RunPod)
        │                                │
        │                                └─ fs, shell, dev server, browser
        └─ approvals, diff editor, transcript
```

Everything the terminal agent can do — start a dev server, hit its own
endpoints, read crash logs, check a page for JS errors — works here unchanged,
because it is the same binary.

## Setup

1. Build the engine:

   ```bash
   cd ../vivid-code && cargo build --release
   ```

2. Build the extension:

   ```bash
   npm install && npm run compile
   ```

3. Open this folder in VS Code and start the Extension Development Host:

   **Run → Start Debugging** from the menu bar, or `Cmd+Shift+P` →
   "Debug: Start Debugging". On a Mac the F5 key is a media key by default, so
   the shortcut is **fn+F5** unless you have turned on "Use F1, F2, etc. keys
   as standard function keys" in System Settings → Keyboard.

   Two configurations are provided: one opens an empty host for you to pick a
   folder, the other opens `/tmp/vivid-demo` so there is something to edit
   immediately.

No `vivid.binaryPath` needed in this repo — the extension finds the sibling
`../vivid-code/target/release/vivid` on its own. Set it only when the binary
lives somewhere else.

The engine endpoint comes from the binary — `--url`, `VIVID_URL`, or
`~/.vivid/config.toml`. Set `vivid.engineUrl` only to override it per workspace.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `vivid.binaryPath` | `vivid` | Path to the engine binary |
| `vivid.engineUrl` | *(empty)* | Override the engine endpoint (`…/v1`) |
| `vivid.model` | *(empty)* | Override the model; empty discovers it from the endpoint |
| `vivid.noDesign` | `false` | Skip the design-brief step |
| `vivid.maxIterations` | `60` | Tool steps per turn |
| `vivid.autoApprove` | `false` | Run shell commands without asking |

**Leave `vivid.autoApprove` off.** The agent writes the command line itself.
The extension never passes `--yolo` to the binary; approval is its job.

## How approval works

`vivid`'s own `ui::confirm` returns `true` whenever the session is not
interactive, so a headless run would approve every command silently. In
`--json` mode the question goes out as an `approval_request` and **the engine
blocks** until the editor answers. If the editor disconnects mid-question the
answer defaults to deny.

That means an approval the user cannot see is an approval they cannot give, so
the view reveals itself when one arrives.

## Diffs

`vivid` emits a `diff` event with both the before and after text. The
extension holds the "before" side behind a `vivid-before:` document provider,
so clicking the diff chip opens a real VS Code diff editor against the file on
disk — not a rendering of a patch.

## Known limits

- **One workspace folder.** The engine is spawned against the first folder; a
  multi-root workspace uses that one only.
- **`bash` output arrives once, at the end.** The binary only streams command
  output live when it thinks a terminal is attached (`shell.rs`), which is
  false here. The result still comes back in full via `tool_result`; live
  streaming into the panel needs a small change on the Rust side.
- **No inline Cmd-K edit and no tab completion.** Those need surfaces the
  extension API does not offer, which is the argument for forking VS Code —
  see the notes in the repo discussion. This extension is the agent panel.
- **The transcript is not persisted.** Reloading the window starts a new
  conversation, and the engine restarts with it.
