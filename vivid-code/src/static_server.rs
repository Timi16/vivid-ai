//! A built-in static file server, so previewing a plain HTML site needs no
//! npm, no python, no cold start — just a URL the user can click.
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;

pub async fn serve(root: PathBuf, port: u16) -> Result<JoinHandle<()>> {
    let listener = TcpListener::bind(("127.0.0.1", port))
        .await
        .with_context(|| format!("could not bind port {port}"))?;
    Ok(tokio::spawn(async move {
        loop {
            let Ok((sock, _)) = listener.accept().await else { break };
            let root = root.clone();
            tokio::spawn(async move {
                let _ = handle(sock, &root).await;
            });
        }
    }))
}

async fn handle(mut sock: TcpStream, root: &Path) -> Result<()> {
    let mut buf = vec![0u8; 8192];
    let n = sock.read(&mut buf).await?;
    let head = String::from_utf8_lossy(&buf[..n]);
    let mut parts = head.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_string();
    let target = parts.next().unwrap_or("/").to_string();

    let (status, mime, body) = resolve(root, &target);
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    sock.write_all(head.as_bytes()).await?;
    if method != "HEAD" {
        sock.write_all(&body).await?;
    }
    sock.flush().await?;
    Ok(())
}

fn resolve(root: &Path, target: &str) -> (&'static str, &'static str, Vec<u8>) {
    let path = target.split(['?', '#']).next().unwrap_or("/");
    let path = percent_decode(path);
    // No escaping the served directory.
    if path.split('/').any(|s| s == "..") {
        return ("403 Forbidden", "text/plain; charset=utf-8", b"forbidden".to_vec());
    }
    let mut file = root.join(path.trim_start_matches('/'));
    if file.is_dir() {
        file = file.join("index.html");
    }
    match std::fs::read(&file) {
        Ok(body) => ("200 OK", mime_of(&file), body),
        Err(_) => {
            // Single-page apps: fall back to the root document.
            match std::fs::read(root.join("index.html")) {
                Ok(body) if !path.contains('.') => ("200 OK", "text/html; charset=utf-8", body),
                _ => ("404 Not Found", "text/plain; charset=utf-8", b"not found".to_vec()),
            }
        }
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn mime_of(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "pdf" => "application/pdf",
        "md" | "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}
