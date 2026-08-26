//! Tool schemas (what the model sees) and dispatch (what actually runs).
pub mod fs;
pub mod server;
pub mod shell;

use crate::process::ProcessManager;
use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct Ctx {
    pub root: PathBuf,
    pub pm: Arc<Mutex<ProcessManager>>,
    pub http: reqwest::Client,
}

/// Tools that change something. After one of these runs, re-running a check
/// is not a repeat — the thing being checked is different now.
///
/// `bash` is deliberately NOT unconditionally in here. Treating every shell
/// command as a change reset the loop detector on every call, which made the
/// most loop-prone tool the one least protected: the same `curl | grep` ran
/// six times in a row without ever tripping it.
pub fn mutates(name: &str, args: &Value) -> bool {
    match name {
        "write_file" | "edit_file" | "serve_static" | "start_server" | "stop_server" => true,
        "bash" => {
            let cmd = arg_str(args, "command").unwrap_or("").trim().to_lowercase();
            let read_only = regex::Regex::new(
                r"^(curl|wget|ls|cat|head|tail|grep|rg|wc|find|echo|pwd|stat|file|which|type|du|df|env|printenv|date|whoami|ps|open|node\s+-c|git\s+(status|log|diff|show|branch))(\s|$)",
            )
            .unwrap();
            !read_only.is_match(&cmd)
        }
        _ => false,
    }
}

/// Tools that print their own output line by line while running.
pub fn streams_output(name: &str) -> bool {
    name == "bash"
}

/// Tools that run arbitrary commands ask the user first (unless --yolo).
pub fn needs_approval(name: &str) -> bool {
    matches!(name, "bash")
}

pub fn schemas() -> Vec<Value> {
    let t = |name: &str, desc: &str, props: Value, required: &[&str]| {
        json!({
            "type": "function",
            "function": {
                "name": name,
                "description": desc,
                "parameters": {"type": "object", "properties": props, "required": required}
            }
        })
    };
    vec![
        t("list_files",
          "List files and folders under a path (gitignore-aware, skips node_modules). Use before reading or writing.",
          json!({"path": {"type": "string", "description": "Relative path, default '.'"},
                 "depth": {"type": "integer", "description": "Max depth, default 3"}}),
          &[]),
        t("read_file",
          "Read a text file with line numbers. For long files pass offset (1-based line) and limit.",
          json!({"path": {"type": "string"},
                 "offset": {"type": "integer", "description": "First line to read, default 1"},
                 "limit": {"type": "integer", "description": "Max lines, default 300"}}),
          &["path"]),
        t("search_files",
          "Search file contents with a regex. Returns path:line: text for up to 100 matches.",
          json!({"pattern": {"type": "string", "description": "Rust/PCRE-style regex"},
                 "path": {"type": "string", "description": "Relative dir to search, default '.'"}}),
          &["pattern"]),
        t("write_file",
          "Create or overwrite a file with the full content. Creates parent folders.",
          json!({"path": {"type": "string"}, "content": {"type": "string"}}),
          &["path", "content"]),
        t("edit_file",
          "Replace old_string with new_string in a file. old_string must appear exactly once — include surrounding lines to make it unique.",
          json!({"path": {"type": "string"}, "old_string": {"type": "string"}, "new_string": {"type": "string"}}),
          &["path", "old_string", "new_string"]),
        t("bash",
          "Run a shell command in the project directory and return its output. Must exit on its own (installs, builds, tests, scripts). Never for servers — use start_server.",
          json!({"command": {"type": "string"},
                 "timeout": {"type": "integer", "description": "Seconds, default 120, max 600"}}),
          &["command"]),
        t("serve_static",
          "Serve a folder of static files (plain HTML/CSS/JS sites) with the built-in web server and return the URL to open. Use this for any site that has no build step — no npm needed. Then use http_request to check the pages.",
          json!({"dir": {"type": "string", "description": "Folder to serve, default '.'"},
                 "port": {"type": "integer", "description": "Default 4173"}}),
          &[]),
        t("start_server",
          "Start a long-running dev server in the background and wait until the port answers. Replaces any server already running. Then use http_request to test it.",
          json!({"command": {"type": "string", "description": "e.g. 'npm run dev', 'node server.js', 'uvicorn main:app --port 8000'"},
                 "port": {"type": "integer", "description": "Port the server will listen on"},
                 "wait_secs": {"type": "integer", "description": "How long to wait for the port, default 45"}}),
          &["command", "port"]),
        t("server_logs",
          "Return the most recent output of the running server (stdout+stderr). Read this after an error.",
          json!({"lines": {"type": "integer", "description": "Default 60"}}),
          &[]),
        t("http_request",
          "Send an HTTP request to the running server on localhost and return status, headers and body. Use this to verify endpoints and pages.",
          json!({"method": {"type": "string", "description": "GET, POST, PUT, DELETE… default GET"},
                 "path": {"type": "string", "description": "Path such as /api/users (targets the running server's port). A full http://localhost:PORT/... URL is also accepted."},
                 "body": {"type": "string", "description": "Request body, e.g. JSON"},
                 "content_type": {"type": "string", "description": "Default application/json when body is set"}}),
          &["path"]),
        t("check_page",
          "Open a page from the running server in a real headless browser and report what actually happens: uncaught JavaScript exceptions, console errors, assets that failed to load, and what ended up on screen (title, visible text, canvas size and whether anything was drawn). http_request only proves a file was served — this is the only way to know the page is not dead. Run it on every page you build.",
          json!({"path": {"type": "string", "description": "Path on the running server, default '/'"},
                 "wait_ms": {"type": "integer", "description": "Extra settle time for animation or fetches, default 1200"}}),
          &[]),
        t("page_eval",
          "Run JavaScript inside a page loaded in a real browser and return what it evaluates to. This is how you TEST behaviour you cannot test from the terminal: click buttons, type keys, read the display, check state. The script's final expression is the result — return a string or a JSON-stringified object. Example for a calculator: click the button elements in order and return the display's text.",
          json!({"path": {"type": "string", "description": "Path on the running server, default '/'"},
                 "script": {"type": "string", "description": "JavaScript to run in the page. The last expression is returned. You may use await."},
                 "wait_ms": {"type": "integer", "description": "Settle time before running, default 800"}}),
          &["script"]),
        t("stop_server", "Stop the running dev server.", json!({}), &[]),
    ]
}

pub async fn run(name: &str, args: &Value, ctx: &Ctx) -> Result<String> {
    match name {
        "list_files" => fs::list_files(ctx, args),
        "read_file" => fs::read_file(ctx, args),
        "search_files" => fs::search_files(ctx, args),
        "write_file" => fs::write_file(ctx, args),
        "edit_file" => fs::edit_file(ctx, args),
        "bash" => shell::bash(ctx, args).await,
        "serve_static" => server::serve_static(ctx, args).await,
        "start_server" => server::start_server(ctx, args).await,
        "server_logs" => server::server_logs(ctx, args).await,
        "http_request" => server::http_request(ctx, args).await,
        "check_page" => server::check_page(ctx, args).await,
        "page_eval" => server::page_eval(ctx, args).await,
        "stop_server" => server::stop_server(ctx).await,
        other => Err(anyhow!("unknown tool `{other}`")),
    }
}

/// Resolve a model-supplied path and refuse anything that escapes the project.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf> {
    let rel = rel.trim();
    let joined = if rel.is_empty() || rel == "." { root.to_path_buf() } else { root.join(rel) };
    // Canonicalise the deepest existing ancestor so new files under it still resolve.
    let mut existing = joined.clone();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    while !existing.exists() {
        match (existing.file_name(), existing.parent()) {
            (Some(n), Some(p)) => {
                tail.push(n.to_os_string());
                existing = p.to_path_buf();
            }
            _ => break,
        }
    }
    let mut canon = existing.canonicalize().unwrap_or(existing);
    for part in tail.iter().rev() {
        canon.push(part);
    }
    let root_canon = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    if !canon.starts_with(&root_canon) {
        return Err(anyhow!("path `{rel}` is outside the project directory"));
    }
    Ok(canon)
}

pub fn arg_str<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str)
}

pub fn arg_u64(args: &Value, key: &str) -> Option<u64> {
    args.get(key).and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
}

pub fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let head = max / 2;
    let tail = max - head;
    let h: String = s.chars().take(head).collect();
    let t: String = s.chars().rev().take(tail).collect::<Vec<_>>().into_iter().rev().collect();
    format!("{h}\n… [{} chars omitted] …\n{t}", s.len() - max)
}
