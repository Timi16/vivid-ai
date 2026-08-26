//! Machine-readable mode (`--json`): NDJSON out on stdout, requests in on stdin.
//!
//! This is the seam the editor extension drives. The TUI writes through
//! `screen`, which is useless to a program; in JSON mode every `ui::` call
//! becomes one line of JSON instead, and nothing else in the agent changes.
//!
//! It also fixes something that would otherwise be a security hole in headless
//! use: `ui::confirm` returns true whenever the session is not interactive, so
//! a non-TTY run auto-approves every shell command the model asks for. Here the
//! question goes to the editor and the loop BLOCKS on a real answer.
//!
//! stdout is the protocol. Anything that must not be parsed as an event —
//! panics, tracing — belongs on stderr.
//!
//! out: {"type":"ready"|"token"|"tool_call"|"tool_result"|"diff"|"busy"
//!       |"usage"|"info"|"warn"|"error"|"turn_end"|"approval_request", ...}
//! in:  {"type":"prompt","text":...} {"type":"approval","id":N,"ok":bool}
//!      {"type":"cancel"} {"type":"quit"}
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Mutex, OnceLock};

static ENABLED: AtomicBool = AtomicBool::new(false);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static CANCELLED: AtomicBool = AtomicBool::new(false);

/// Guards stdout so two threads cannot interleave halves of a line.
static OUT: OnceLock<Mutex<()>> = OnceLock::new();

struct Inbox {
    prompts: Mutex<Receiver<String>>,
    approvals: Mutex<Receiver<(u64, bool)>>,
}
static INBOX: OnceLock<Inbox> = OnceLock::new();

pub fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

/// Turn on JSON mode and start the stdin reader.
///
/// One thread owns stdin for the whole process: prompts and approvals arrive
/// on the same pipe, and two readers would steal each other's lines.
pub fn enable() {
    ENABLED.store(true, Ordering::Relaxed);
    let (ptx, prx): (Sender<String>, Receiver<String>) = channel();
    let (atx, arx): (Sender<(u64, bool)>, Receiver<(u64, bool)>) = channel();
    let _ = INBOX.set(Inbox { prompts: Mutex::new(prx), approvals: Mutex::new(arx) });

    std::thread::spawn(move || {
        let stdin = std::io::stdin();
        for line in stdin.lock().lines() {
            let Ok(line) = line else { break };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let Ok(v) = serde_json::from_str::<Value>(line) else {
                emit("error", json!({"code": "bad_frame", "message": "expected one JSON object per line"}));
                continue;
            };
            match v["type"].as_str().unwrap_or("") {
                "prompt" => {
                    CANCELLED.store(false, Ordering::Relaxed);
                    let text = v["text"].as_str().unwrap_or("").to_string();
                    if ptx.send(text).is_err() {
                        break;
                    }
                }
                "approval" => {
                    let id = v["id"].as_u64().unwrap_or(0);
                    let ok = v["ok"].as_bool().unwrap_or(false);
                    let _ = atx.send((id, ok));
                }
                // Cooperative: the agent checks this between steps. A tool
                // already running still runs to completion.
                "cancel" => CANCELLED.store(true, Ordering::Relaxed),
                "quit" => break,
                other => emit("error", json!({
                    "code": "unknown_type",
                    "message": format!("unknown frame type {other:?}")
                })),
            }
        }
        // stdin closed: the editor went away. Drop the senders so a blocked
        // next_prompt() returns None and the process can shut down cleanly.
    });
}

pub fn cancelled() -> bool {
    CANCELLED.load(Ordering::Relaxed)
}

pub fn clear_cancel() {
    CANCELLED.store(false, Ordering::Relaxed);
}

/// Write one event. Never panics: if stdout is gone the editor is gone, and
/// the run is over anyway.
pub fn emit(kind: &str, mut body: Value) {
    if !enabled() {
        return;
    }
    if !body.is_object() {
        body = json!({ "value": body });
    }
    body["type"] = json!(kind);
    let _guard = OUT.get_or_init(|| Mutex::new(())).lock();
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{body}");
    let _ = out.flush();
}

/// Ask the editor to approve something, and wait for the answer.
///
/// Blocking is the point: the caller is the agent loop deciding whether to run
/// a command. A closed stdin means no one can answer, so it denies — the safe
/// direction, and the opposite of what non-interactive `ui::confirm` does.
pub fn confirm(question: &str, detail: Value) -> bool {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    emit("approval_request", json!({"id": id, "question": question, "detail": detail}));

    let Some(inbox) = INBOX.get() else { return false };
    let Ok(rx) = inbox.approvals.lock() else { return false };
    // Answers to questions we already gave up on can still be in the pipe;
    // skip anything that is not this id rather than taking a stale yes.
    loop {
        match rx.recv() {
            Ok((got, ok)) if got == id => return ok,
            Ok(_) => continue,
            Err(_) => return false, // editor disconnected
        }
    }
}

/// Block until the editor sends the next prompt. None = it disconnected.
pub fn next_prompt() -> Option<String> {
    let inbox = INBOX.get()?;
    let rx = inbox.prompts.lock().ok()?;
    rx.recv().ok()
}
