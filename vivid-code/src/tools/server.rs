use super::{arg_str, arg_u64, truncate, Ctx};
use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::time::Duration;

pub async fn serve_static(ctx: &Ctx, args: &Value) -> Result<String> {
    let dir = super::resolve(&ctx.root, arg_str(args, "dir").unwrap_or("."))?;
    let port = arg_u64(args, "port").unwrap_or(4173).clamp(1024, 65535) as u16;
    let mut pm = ctx.pm.lock().await;
    let out = pm.serve_static(dir, port).await?;
    crate::screen::set_preview(pm.url());
    Ok(out)
}

pub async fn start_server(ctx: &Ctx, args: &Value) -> Result<String> {
    let command = arg_str(args, "command").ok_or_else(|| anyhow!("command is required"))?;
    let port = arg_u64(args, "port").ok_or_else(|| anyhow!("port is required"))? as u16;
    let wait = arg_u64(args, "wait_secs").unwrap_or(45).clamp(3, 180);
    let mut pm = ctx.pm.lock().await;
    let out = pm.start(&ctx.root, command, port, wait).await;
    crate::screen::set_preview(if pm.is_running() { pm.url() } else { None });
    out
}

pub async fn server_logs(ctx: &Ctx, args: &Value) -> Result<String> {
    let n = arg_u64(args, "lines").unwrap_or(60).clamp(1, 400) as usize;
    let mut pm = ctx.pm.lock().await;
    let running = pm.is_running();
    let head = if running {
        format!("Server `{}` is running on port {}.\n", pm.command, pm.port.unwrap_or(0))
    } else if pm.command.is_empty() {
        "No server has been started.\n".to_string()
    } else {
        format!("Server `{}` has EXITED.\n", pm.command)
    };
    Ok(format!("{head}{}", pm.tail(n)))
}

pub async fn stop_server(ctx: &Ctx) -> Result<String> {
    let mut pm = ctx.pm.lock().await;
    let out = pm.stop().await;
    crate::screen::set_preview(None);
    Ok(out)
}

pub async fn check_page(ctx: &Ctx, args: &Value) -> Result<String> {
    let path = arg_str(args, "path").unwrap_or("/");
    let wait = arg_u64(args, "wait_ms").unwrap_or(1200).clamp(0, 15_000);
    let port = {
        let mut pm = ctx.pm.lock().await;
        if !pm.is_running() {
            return Err(anyhow!("no server is running — start one first"));
        }
        pm.port.unwrap_or(3000)
    };
    let p = if path.starts_with('/') { path.to_string() } else { format!("/{path}") };
    let url = format!("http://127.0.0.1:{port}{p}");

    let r = crate::browser::inspect(&url, wait).await?;

    let mut out = format!("Opened {url} in a headless browser.\n");
    out.push_str(&format!("title: {}\n", if r.title.is_empty() { "(none)" } else { &r.title }));

    if r.errors.is_empty() {
        out.push_str("javascript errors: none\n");
    } else {
        out.push_str(&format!("JAVASCRIPT ERRORS ({}):\n", r.errors.len()));
        for e in r.errors.iter().take(12) {
            out.push_str(&format!("  - {}\n", e.chars().take(300).collect::<String>()));
        }
    }
    if !r.failed_requests.is_empty() {
        out.push_str(&format!("FAILED REQUESTS ({}):\n", r.failed_requests.len()));
        for f in r.failed_requests.iter().take(10) {
            out.push_str(&format!("  - {f}\n"));
        }
    }
    if !r.warnings.is_empty() {
        out.push_str(&format!("warnings ({}): {}\n", r.warnings.len(),
            r.warnings.iter().take(3).map(|w| w.chars().take(120).collect::<String>())
                .collect::<Vec<_>>().join(" | ")));
    }

    let st = &r.stats;
    out.push_str(&format!(
        "on screen: {} elements, {} characters of visible text\n",
        st["elements"].as_u64().unwrap_or(0),
        st["visible_text_chars"].as_u64().unwrap_or(0)
    ));
    if let Some(cs) = st["canvases"].as_array() {
        if cs.is_empty() {
            out.push_str("canvases: none\n");
        } else {
            for (i, c) in cs.iter().enumerate() {
                let (w, h) = (c["w"].as_u64().unwrap_or(0), c["h"].as_u64().unwrap_or(0));
                let (cw, ch) = (c["cw"].as_u64().unwrap_or(0), c["ch"].as_u64().unwrap_or(0));
                out.push_str(&format!("canvas {}: drawing buffer {w}x{h}, laid out {cw}x{ch}\n", i + 1));
                if w == 0 || h == 0 || cw == 0 || ch == 0 {
                    out.push_str("  ^ zero-sized: nothing can render into it\n");
                } else if w == 300 && h == 150 {
                    out.push_str("  ^ 300x150 is the browser default — the renderer never called setSize, so it probably never ran\n");
                }
            }
        }
    }
    if let (Some(f), true) = (&r.framing, r.shot_is_canvas) {
        if f.coverage_pct < 0.4 {
            out.push_str(&format!(
                "FRAMING: only {:.1}% of the canvas has anything drawn on it — the scene is \
                 effectively empty. Check the camera is pointing at your objects and that they are \
                 within its near/far planes.\n",
                f.coverage_pct
            ));
        } else {
            out.push_str(&format!(
                "framing: drawn content covers {:.0}% of the canvas, spanning {:.0}%–{:.0}% across \
                 and {:.0}%–{:.0}% down\n",
                f.coverage_pct, f.left_pct, f.right_pct, f.top_pct, f.bottom_pct
            ));
            if !f.clipped_edges.is_empty() {
                out.push_str(&format!(
                    "FRAMING PROBLEM: the scene runs off the {} edge{}. Move the camera back \
                     (increase its distance or fov) or reposition the subject so the whole thing fits \
                     with a margin.\n",
                    f.clipped_edges.join(" and "),
                    if f.clipped_edges.len() > 1 { "s" } else { "" }
                ));
            }
            if f.coverage_pct < 6.0 && f.clipped_edges.is_empty() {
                out.push_str(
                    "FRAMING PROBLEM: the subject is tiny in a mostly empty frame. Move the camera \
                     closer or scale the scene up so it fills the view.\n",
                );
            }
        }
    }
    if let (Some(b), true) = (r.shot_bytes, r.shot_is_canvas) {
        if b < 2_500 {
            out.push_str(&format!(
                "CANVAS IS FLAT: a screenshot of the canvas region is only {b} bytes, i.e. a single \
                 colour. Nothing was drawn — check that the renderer got a context, that objects were \
                 added to the scene, and that the render loop is running.\n"
            ));
        } else {
            out.push_str(&format!("canvas screenshot: {b} bytes — real content was drawn\n"));
        }
    }
    if st["images_broken"].as_u64().unwrap_or(0) > 0 {
        out.push_str(&format!("broken images: {}\n", st["images_broken"]));
    }
    if let Some(t) = st["text_preview"].as_str() {
        if !t.trim().is_empty() {
            out.push_str(&format!("text preview: {}\n", t.replace('\n', " / ").chars().take(280).collect::<String>()));
        }
    }
    if !r.webgl_env.is_empty() || st["webgl"].as_str() == Some("unavailable") {
        out.push_str(
            "note: this headless browser could not create a WebGL context. That is a limitation of \
             the checker, NOT a bug in your page — do not try to fix it, and do not switch away from \
             WebGL because of it. Everything else in this report is still accurate.\n",
        );
    }
    if !r.errors.is_empty() {
        out.push_str("\nThe page is broken. Read the error above, fix the cause, then check_page again.\n");
    }
    Ok(out)
}

pub async fn http_request(ctx: &Ctx, args: &Value) -> Result<String> {
    let method = arg_str(args, "method").unwrap_or("GET").to_uppercase();
    let path = arg_str(args, "path").ok_or_else(|| anyhow!("path is required"))?;
    let url = if path.starts_with("http://") || path.starts_with("https://") {
        let lower = path.to_lowercase();
        if !(lower.starts_with("http://localhost") || lower.starts_with("http://127.0.0.1") || lower.starts_with("http://0.0.0.0")) {
            return Err(anyhow!("http_request only reaches localhost"));
        }
        path.to_string()
    } else {
        let port = {
            let mut pm = ctx.pm.lock().await;
            if !pm.is_running() {
                return Err(anyhow!("no server is running — call start_server first"));
            }
            pm.port.unwrap_or(3000)
        };
        let p = if path.starts_with('/') { path.to_string() } else { format!("/{path}") };
        format!("http://127.0.0.1:{port}{p}")
    };

    let m = reqwest::Method::from_bytes(method.as_bytes()).context("bad HTTP method")?;
    let mut req = ctx.http.request(m, &url).timeout(Duration::from_secs(30));
    if let Some(body) = arg_str(args, "body") {
        let ct = arg_str(args, "content_type").unwrap_or("application/json");
        req = req.header("content-type", ct).body(body.to_string());
    }
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => return Ok(format!("Request to {url} failed: {e}\nThe server may have crashed — check server_logs.")),
    };
    let status = resp.status();
    let ct = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let body = resp.text().await.unwrap_or_default();
    let raw_len = body.len();
    let shaped = if ct.contains("text/html") { summarize_html(&body) } else { body };
    Ok(format!(
        "{method} {url}\nHTTP {status}\ncontent-type: {ct}\nbody: {raw_len} bytes received in full\n\n{}",
        truncate(shaped.trim(), 8_000)
    ))
}

/// Keep HTML readable without lying about it.
///
/// This used to delete `<script>` and `<style>` blocks outright. On a page
/// whose entire content is a script — a canvas or WebGL app — that left an
/// empty shell, and the model reasonably concluded the server was broken and
/// rebuilt it from scratch. Now the tags survive and only their bodies are
/// summarised, so the structure is visible and the elision is explicit.
fn summarize_html(html: &str) -> String {
    let re = regex::Regex::new(r"(?is)<(script|style)([^>]*)>(.*?)</(?:script|style)>").unwrap();
    re.replace_all(html, |c: &regex::Captures| {
        let tag = c[1].to_lowercase();
        let attrs = c[2].trim().to_string();
        let body = &c[3];
        let lines = body.lines().filter(|l| !l.trim().is_empty()).count();
        if body.trim().is_empty() {
            // e.g. <script src="…"></script> — nothing was hidden.
            return format!("<{tag}{}{}></{tag}>", if attrs.is_empty() { "" } else { " " }, attrs);
        }
        format!(
            "<{tag}{}{}>/* {lines} lines of inline {} present, elided here — the page was served in full */</{tag}>",
            if attrs.is_empty() { "" } else { " " },
            attrs,
            if tag == "script" { "JavaScript" } else { "CSS" }
        )
    })
    .to_string()
}
