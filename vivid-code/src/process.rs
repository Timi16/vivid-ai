//! Keeps one dev server alive across model turns. Own process group so the
//! whole tree (pnpm → next → node) dies together; output kept in a ring buffer.
use anyhow::{Context, Result};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};

const MAX_LOG_LINES: usize = 600;

#[derive(Default)]
pub struct ProcessManager {
    child: Option<Child>,
    /// The built-in static server, when that is what is serving.
    static_task: Option<tokio::task::JoinHandle<()>>,
    pgid: Option<i32>,
    pub port: Option<u16>,
    pub command: String,
    logs: Arc<Mutex<VecDeque<String>>>,
}

impl ProcessManager {
    pub fn is_running(&mut self) -> bool {
        if let Some(t) = &self.static_task {
            if !t.is_finished() {
                return true;
            }
        }
        match self.child.as_mut() {
            Some(c) => matches!(c.try_wait(), Ok(None)),
            None => false,
        }
    }

    pub fn url(&self) -> Option<String> {
        self.port.map(|p| format!("http://localhost:{p}"))
    }

    /// Serve `dir` with the built-in file server.
    pub async fn serve_static(&mut self, dir: PathBuf, port: u16) -> Result<String> {
        if self.child.is_some() || self.static_task.is_some() {
            self.stop().await;
        }
        self.logs.lock().unwrap().clear();
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            return Ok(format!("Port {port} is already in use. Pick another port."));
        }
        let task = crate::static_server::serve(dir.clone(), port).await?;
        self.static_task = Some(task);
        self.port = Some(port);
        self.command = format!("static server for {}", dir.display());
        Ok(format!(
            "Serving {} at http://localhost:{port} — open that in a browser. \
             Use http_request to check pages.",
            dir.display()
        ))
    }

    pub async fn start(&mut self, root: &Path, command: &str, port: u16, wait_secs: u64) -> Result<String> {
        if self.child.is_some() || self.static_task.is_some() {
            self.stop().await;
        }
        self.logs.lock().unwrap().clear();
        if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            return Ok(format!(
                "Port {port} is already in use by another process (not started by Vivid). \
                 Choose a different port and make the app listen on it (or read process.env.PORT)."
            ));
        }

        let mut cmd = Command::new("sh");
        cmd.arg("-c")
            .arg(command)
            .current_dir(root)
            .env("PORT", port.to_string())
            .env("BROWSER", "none")
            .env("FORCE_COLOR", "0")
            .env("NO_COLOR", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        cmd.process_group(0);

        let mut child = cmd.spawn().with_context(|| format!("could not start `{command}`"))?;
        self.pgid = child.id().map(|p| p as i32);

        for (name, reader) in [
            ("out", child.stdout.take().map(|s| Box::pin(s) as std::pin::Pin<Box<dyn tokio::io::AsyncRead + Send>>)),
            ("err", child.stderr.take().map(|s| Box::pin(s) as std::pin::Pin<Box<dyn tokio::io::AsyncRead + Send>>)),
        ] {
            if let Some(r) = reader {
                let logs = self.logs.clone();
                tokio::spawn(async move {
                    let mut lines = BufReader::new(r).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        let mut l = logs.lock().unwrap();
                        if l.len() >= MAX_LOG_LINES {
                            l.pop_front();
                        }
                        l.push_back(format!("[{name}] {line}"));
                    }
                });
            }
        }

        self.child = Some(child);
        self.port = Some(port);
        self.command = command.to_string();

        let start = Instant::now();
        loop {
            if let Some(status) = self.child.as_mut().unwrap().try_wait()? {
                let logs = self.tail(40);
                self.child = None;
                return Ok(format!("Server exited immediately with {status}.\nLogs:\n{logs}"));
            }
            if TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
                tokio::time::sleep(Duration::from_millis(400)).await;
                if let Some(status) = self.child.as_mut().unwrap().try_wait()? {
                    let logs = self.tail(40);
                    self.child = None;
                    return Ok(format!("Server exited with {status} right after starting.\nLogs:\n{logs}"));
                }
                return Ok(format!(
                    "Server is up on http://localhost:{port} (pid {}).\nRecent logs:\n{}",
                    self.pgid.unwrap_or(0),
                    self.tail(15)
                ));
            }
            if start.elapsed() > Duration::from_secs(wait_secs) {
                return Ok(format!(
                    "Process is still running but nothing is listening on port {port} after {wait_secs}s. \
                     Check the logs — the app may use a different port or still be compiling.\nLogs:\n{}",
                    self.tail(40)
                ));
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }

    pub fn tail(&self, n: usize) -> String {
        let l = self.logs.lock().unwrap();
        let skip = l.len().saturating_sub(n);
        let s: Vec<&str> = l.iter().skip(skip).map(String::as_str).collect();
        if s.is_empty() { "(no output yet)".into() } else { s.join("\n") }
    }

    pub async fn stop(&mut self) -> String {
        if let Some(task) = self.static_task.take() {
            task.abort();
            let msg = format!("Stopped the static server on port {}.", self.port.unwrap_or(0));
            self.port = None;
            self.command.clear();
            return msg;
        }
        let Some(mut child) = self.child.take() else {
            return "No server is running.".into();
        };
        #[cfg(unix)]
        if let Some(pgid) = self.pgid {
            unsafe {
                libc::killpg(pgid, libc::SIGTERM);
            }
        }
        let graceful = tokio::time::timeout(Duration::from_secs(3), child.wait()).await;
        if graceful.is_err() {
            #[cfg(unix)]
            if let Some(pgid) = self.pgid {
                unsafe {
                    libc::killpg(pgid, libc::SIGKILL);
                }
            }
            let _ = child.kill().await;
        }
        let msg = format!("Stopped `{}` on port {}.", self.command, self.port.unwrap_or(0));
        self.pgid = None;
        self.port = None;
        msg
    }
}
