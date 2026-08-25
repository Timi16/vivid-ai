use super::{arg_str, arg_u64, truncate, Ctx};
use crate::{screen, ui};
use anyhow::{anyhow, Context, Result};
use regex::Regex;
use serde_json::Value;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

const MAX_OUTPUT: usize = 16_000;
/// Live lines shown to the user. The model still gets the full capped text.
const MAX_SHOWN: usize = 200;

pub async fn bash(ctx: &Ctx, args: &Value) -> Result<String> {
    let command = arg_str(args, "command").ok_or_else(|| anyhow!("command is required"))?;

    let deny = Regex::new(r"(^|[\s;&|])(sudo|mkfs|shutdown|reboot|dd\s)|rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?/(\s|$)|:\(\)\s*\{").unwrap();
    if deny.is_match(command) {
        return Err(anyhow!("refused: `{command}` looks destructive or needs privileges"));
    }
    // Servers never exit on their own; don't sit on the timeout, redirect right away.
    let server_like = Regex::new(
        r"(^|[\s;&|])(node\s+\S*(server|app|index)\S*\.[cm]?js|(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|preview)|next\s+(dev|start)|vite(\s|$)|nodemon|uvicorn|gunicorn|flask\s+run|python3?\s+-m\s+http\.server|php\s+-S|rails\s+s(erver)?|serve\s+)",
    ).unwrap();
    if server_like.is_match(command) && !command.contains("--help") {
        return Ok(format!(
            "`{command}` looks like a long-running server, so it was not run with bash. \
             Use start_server with this command and the port it listens on, then http_request to test it."
        ));
    }

    // Package installs and image builds routinely run past two minutes; the
    // model should not have to remember to raise the timeout for them.
    let slow = Regex::new(
        r"(npm|pnpm|yarn|bun)\s+(i|install|ci|create)|npx\s+create-|create-(next|react|vite)|docker\s+(build|pull|compose)|cargo\s+(build|install|test)|pip3?\s+install",
    ).unwrap();
    let default = if slow.is_match(command) { 480 } else { 120 };
    let timeout = arg_u64(args, "timeout").unwrap_or(default).clamp(1, 600);

    let mut child = Command::new("sh")
        .arg("-c")
        .arg(command)
        .current_dir(&ctx.root)
        .env("CI", "1")
        .env("FORCE_COLOR", "0")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .context("could not spawn shell")?;

    // Stream both pipes to the screen as they arrive, so a long install looks
    // alive instead of frozen, while collecting the text for the model.
    let (tx, mut rx) = mpsc::channel::<(bool, String)>(1024);
    if let Some(out) = child.stdout.take() {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                if tx.send((false, l)).await.is_err() {
                    break;
                }
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                if tx.send((true, l)).await.is_err() {
                    break;
                }
            }
        });
    }
    drop(tx);

    let live = screen::is_interactive();
    let mut stdout_text = String::new();
    let mut stderr_text = String::new();
    let mut shown = 0usize;

    let collect = async {
        while let Some((is_err, line)) = rx.recv().await {
            if live {
                if shown < MAX_SHOWN {
                    ui::stream_line(&line, is_err);
                } else if shown == MAX_SHOWN {
                    ui::stream_line("… (output continues; the rest is captured but not shown)", false);
                }
                shown += 1;
            }
            let sink = if is_err { &mut stderr_text } else { &mut stdout_text };
            if sink.len() < MAX_OUTPUT * 2 {
                sink.push_str(&line);
                sink.push('\n');
            }
        }
        child.wait().await
    };

    let status = match tokio::time::timeout(Duration::from_secs(timeout), collect).await {
        Ok(s) => s?,
        Err(_) => {
            return Ok(format!(
                "Command timed out after {timeout}s and was killed. If this is a server or watcher, use start_server instead.\n\
                 Output so far:\n{}",
                truncate(stdout_text.trim_end(), 4_000)
            ))
        }
    };

    let mut out = String::new();
    if !stdout_text.trim().is_empty() {
        out.push_str(stdout_text.trim_end());
        out.push('\n');
    }
    if !stderr_text.trim().is_empty() {
        out.push_str("[stderr]\n");
        out.push_str(stderr_text.trim_end());
        out.push('\n');
    }
    let code = status.code().unwrap_or(-1);
    let body = if out.trim().is_empty() { "(no output)".to_string() } else { truncate(out.trim_end(), MAX_OUTPUT) };
    Ok(format!("exit code {code}\n{body}"))
}
