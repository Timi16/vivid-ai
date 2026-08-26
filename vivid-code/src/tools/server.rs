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

/// How many times framing has been flagged this session. The measurement is a
/// heuristic; repeating it turned the model into a camera-tweaking loop that
/// never converged, so the nag is said once and then withdrawn.
static FRAMING_WARNINGS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

pub async fn page_eval(ctx: &Ctx, args: &Value) -> Result<String> {
    let script = arg_str(args, "script").ok_or_else(|| anyhow!("script is required"))?;
    let path = arg_str(args, "path").unwrap_or("/");
    let wait = arg_u64(args, "wait_ms").unwrap_or(800).clamp(0, 10_000);
    let port = {
        let mut pm = ctx.pm.lock().await;
        if !pm.is_running() {
            return Err(anyhow!("no server is running — start one first"));
        }
        pm.port.unwrap_or(3000)
    };
    let p = if path.starts_with('/') { path.to_string() } else { format!("/{path}") };
    let url = format!("http://127.0.0.1:{port}{p}");

    let (value, errors) = crate::browser::eval(&url, script, wait).await?;
    let mut out = format!("ran in {url}\nresult: {}\n", truncate(&value, 4_000));
    if !errors.is_empty() {
        out.push_str(&format!("javascript errors while running ({}):\n", errors.len()));
        for e in errors.iter().take(6) {
            out.push_str(&format!("  - {}\n", e.chars().take(200).collect::<String>()));
        }
    }
    if value.starts_with("THREW:") {
        out.push_str("The script itself threw. Check the selectors and the API you assumed exist.\n");
    }
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
    // A page with no drawn pixels and no words on it is broken, whatever the
    // console says. Without this, "javascript errors: none" reads as success on
    // a completely empty page.
    let text_chars = st["visible_text_chars"].as_u64().unwrap_or(0);
    let no_canvas = st["canvases"].as_array().map(|a| a.is_empty()).unwrap_or(true);
    // A frame that compresses to almost nothing is flat, whatever the pixel
    // sampler says — the two signals disagree on low-contrast scenes.
    let flat_bytes = r.shot_bytes.map(|b| b < 3_000).unwrap_or(false);
    let blank = flat_bytes || r.framing.as_ref().map(|f| f.coverage_pct < 0.4).unwrap_or(false);
    if blank && text_chars < 5 {
        out.push_str(
            "THE PAGE IS BLANK. Nothing was drawn and there is no visible text, even though no \
             JavaScript error was thrown.\n",
        );
        if no_canvas {
            out.push_str(
                "  There is no <canvas> in the document at all. A WebGLRenderer creates one but does \
                 NOT attach it: you must append `renderer.domElement` to the page \
                 (`document.body.appendChild(renderer.domElement)`), or construct the renderer against \
                 a canvas that is already in the HTML.\n",
            );
        } else {
            out.push_str(
                "  A canvas exists but nothing reached it. Check that the render loop actually runs, \
                 that objects were added to the scene, and that the camera is looking at them.\n",
            );
        }
    }
    if let (Some(f), true) = (&r.framing, r.shot_is_canvas) {
        if f.dominance > 0.985 {
            out.push_str(&format!(
                "THE CANVAS IS EMPTY: {:.1}% of it is a single flat colour, so nothing is being \
                 drawn into it even though no error was thrown. Usual causes: the render loop never \
                 starts (call it once directly, not only from an event handler), the scene has no \
                 light so every material renders black, or the camera is not pointing at the \
                 objects. Fix the cause and check again.\n",
                f.dominance * 100.0
            ));
        } else if f.coverage_pct < 0.4 {
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
            // Only flag framing when it is unambiguous. This measurement is a
            // heuristic on pixels, and a borderline reading previously sent the
            // model into a loop of camera tweaks that never converged — a false
            // alarm here costs more than a missed one.
            let bad_edges = f.clipped_edges.len() >= 3;
            let too_small = f.coverage_pct < 2.0;
            let warned = FRAMING_WARNINGS.load(std::sync::atomic::Ordering::Relaxed);
            if (bad_edges || too_small) && warned >= 2 {
                out.push_str(
                    "framing still reads low, but you have already adjusted the camera twice. This \
                     measurement is approximate and may simply be wrong about a dark or sparse scene. \
                     STOP changing the camera. Finish the task and say in your summary that the \
                     framing could not be confirmed from the terminal.\n",
                );
            } else if bad_edges || too_small {
                FRAMING_WARNINGS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                if bad_edges {
                    out.push_str(&format!(
                        "FRAMING: the scene appears to run off the {} edges.\n",
                        f.clipped_edges.join(", ")
                    ));
                } else {
                    out.push_str("FRAMING: the subject looks tiny in a mostly empty frame.\n");
                }
                out.push_str(
                    "  Do not nudge the camera by hand and re-check — derive the distance from the \
                     scene's own size, once:\n\
                    \x20   const box = new THREE.Box3().setFromObject(root);\n\
                    \x20   const size = box.getSize(new THREE.Vector3());\n\
                    \x20   const center = box.getCenter(new THREE.Vector3());\n\
                    \x20   const fit = Math.max(size.x, size.y, size.z);\n\
                    \x20   const dist = (fit / 2) / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.6;\n\
                    \x20   camera.position.set(center.x, center.y, center.z + dist);\n\
                    \x20   camera.lookAt(center);\n\
                    \x20   camera.near = dist / 100; camera.far = dist * 10; camera.updateProjectionMatrix();\n\
                      where `root` is the object (or Group) holding the whole apparatus. The 1.6 is \
                     the margin. Apply this ONCE. Do not keep nudging the camera and re-checking: \
                     this measurement is approximate, and if it still reads oddly after one proper \
                     fix, say so in your report and move on.\n",
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
