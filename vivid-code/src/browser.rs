//! Drive a real headless browser to find out what a page actually does.
//!
//! Fetching a page proves it was served; it says nothing about whether the
//! JavaScript parsed, the assets resolved, or anything was drawn. This loads
//! the page in Chrome over the DevTools protocol and reports console errors,
//! uncaught exceptions, failed requests and what ended up on screen — the
//! things that make a page ship dead while every HTTP check passes.
use anyhow::{anyhow, Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::process::Stdio;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::process::{Child, Command};

const CHROME_PATHS: &[&str] = &[
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
];

pub fn find_browser() -> Option<String> {
    if let Ok(p) = std::env::var("VIVID_BROWSER") {
        if std::path::Path::new(&p).exists() {
            return Some(p);
        }
    }
    CHROME_PATHS.iter().find(|p| std::path::Path::new(p).exists()).map(|p| p.to_string())
}

pub struct Report {
    pub title: String,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub failed_requests: Vec<String>,
    pub stats: Value,
    /// WebGL problems caused by the headless browser itself, not by the page.
    pub webgl_env: Vec<String>,
    /// Size of the captured frame in bytes; tiny means it is flat colour.
    pub shot_bytes: Option<usize>,
    /// True when that capture was cropped to the canvas rather than the page.
    pub shot_is_canvas: bool,
    /// Where the drawn content sits inside that capture.
    pub framing: Option<Framing>,
}

/// Where the non-background pixels are. A scene can be error-free and still be
/// badly framed — the subject half off-screen, or a speck in an empty field —
/// and no HTTP check or console log will ever say so.
pub struct Framing {
    pub coverage_pct: f32,
    pub left_pct: f32,
    pub right_pct: f32,
    pub top_pct: f32,
    pub bottom_pct: f32,
    pub clipped_edges: Vec<&'static str>,
}

/// Decode the capture and locate everything that is not the background colour.
fn analyse_frame(b64: &str) -> Option<Framing> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    let decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    let (w, h) = (info.width as usize, info.height as usize);
    if w < 8 || h < 8 {
        return None;
    }
    let ch = match info.color_type {
        png::ColorType::Rgba => 4,
        png::ColorType::Rgb => 3,
        _ => return None,
    };
    let px = |x: usize, y: usize| -> (i32, i32, i32) {
        let i = (y * w + x) * ch;
        (buf[i] as i32, buf[i + 1] as i32, buf[i + 2] as i32)
    };
    // The corners agree on the background in almost every rendered scene.
    let bg = {
        let c = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
        (
            c.iter().map(|p| p.0).sum::<i32>() / 4,
            c.iter().map(|p| p.1).sum::<i32>() / 4,
            c.iter().map(|p| p.2).sum::<i32>() / 4,
        )
    };
    let step = (w.max(h) / 400).max(1); // sample, do not scan every pixel
    let (mut minx, mut miny, mut maxx, mut maxy) = (w, h, 0usize, 0usize);
    let mut hits = 0usize;
    let mut total = 0usize;
    for y in (0..h).step_by(step) {
        for x in (0..w).step_by(step) {
            total += 1;
            let (r, g, b) = px(x, y);
            if (r - bg.0).abs() + (g - bg.1).abs() + (b - bg.2).abs() > 24 {
                hits += 1;
                minx = minx.min(x);
                maxx = maxx.max(x);
                miny = miny.min(y);
                maxy = maxy.max(y);
            }
        }
    }
    if hits == 0 {
        return Some(Framing {
            coverage_pct: 0.0,
            left_pct: 0.0, right_pct: 0.0, top_pct: 0.0, bottom_pct: 0.0,
            clipped_edges: vec![],
        });
    }
    let pct = |v: usize, d: usize| (v as f32 / d as f32) * 100.0;
    let mut clipped = Vec::new();
    let m = (step * 2).max(3);
    if minx <= m { clipped.push("left"); }
    if maxx + m >= w { clipped.push("right"); }
    if miny <= m { clipped.push("top"); }
    if maxy + m >= h { clipped.push("bottom"); }
    Some(Framing {
        coverage_pct: (hits as f32 / total as f32) * 100.0,
        left_pct: pct(minx, w),
        right_pct: pct(maxx, w),
        top_pct: pct(miny, h),
        bottom_pct: pct(maxy, h),
        clipped_edges: clipped,
    })
}

/// A browser process that cleans up after itself.
struct Browser {
    child: Child,
    _dir: tempdir::Dir,
}

impl Drop for Browser {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

mod tempdir {
    pub struct Dir(pub std::path::PathBuf);
    impl Dir {
        pub fn new() -> std::io::Result<Self> {
            let mut p = std::env::temp_dir();
            let n: u64 = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(0);
            p.push(format!("vivid-chrome-{n}"));
            std::fs::create_dir_all(&p)?;
            Ok(Dir(p))
        }
    }
    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}

async fn free_port() -> Result<u16> {
    let l = TcpListener::bind("127.0.0.1:0").await?;
    Ok(l.local_addr()?.port())
}

pub async fn inspect(url: &str, settle_ms: u64) -> Result<Report> {
    let exe = find_browser().ok_or_else(|| {
        anyhow!("no Chrome/Chromium found. Install Google Chrome, or set VIVID_BROWSER to a browser binary.")
    })?;
    let port = free_port().await?;
    let dir = tempdir::Dir::new()?;

    let child = Command::new(&exe)
        .args([
            "--headless=new",
            // WebGL must work or every 3D page looks broken. SwiftShader is
            // Chrome's software rasteriser; without it a canvas that is fine
            // in a real browser reports "WebGL context creation failed".
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--disable-software-rasterizer=false",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--mute-audio",
            "--window-size=1280,900",
            &format!("--remote-debugging-port={port}"),
            &format!("--user-data-dir={}", dir.0.display()),
            "about:blank",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .with_context(|| format!("could not start {exe}"))?;
    let _guard = Browser { child, _dir: dir };

    // Wait for the DevTools endpoint to answer.
    let http = reqwest::Client::new();
    let mut ws_url = None;
    for _ in 0..60 {
        tokio::time::sleep(Duration::from_millis(120)).await;
        if let Ok(r) = http.get(format!("http://127.0.0.1:{port}/json/list")).send().await {
            if let Ok(v) = r.json::<Value>().await {
                if let Some(t) = v.as_array().and_then(|a| {
                    a.iter().find(|t| t["type"] == "page" && t["webSocketDebuggerUrl"].is_string())
                }) {
                    ws_url = t["webSocketDebuggerUrl"].as_str().map(String::from);
                    break;
                }
            }
        }
    }
    let ws_url = ws_url.ok_or_else(|| anyhow!("the browser started but never exposed a DevTools endpoint"))?;

    let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .context("could not attach to the browser")?;

    let mut id = 0u64;
    macro_rules! cdp {
        ($method:expr, $params:expr) => {{
            id += 1;
            let msg = json!({"id": id, "method": $method, "params": $params}).to_string();
            ws.send(tokio_tungstenite::tungstenite::Message::Text(msg)).await?;
            id
        }};
    }

    cdp!("Runtime.enable", json!({}));
    cdp!("Log.enable", json!({}));
    cdp!("Network.enable", json!({}));
    cdp!("Page.enable", json!({}));
    cdp!("Page.navigate", json!({"url": url}));

    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut failed = Vec::new();
    let deadline = tokio::time::Instant::now() + Duration::from_millis(settle_ms.max(800) + 2_500);

    while tokio::time::Instant::now() < deadline {
        let next = tokio::time::timeout_at(deadline, ws.next()).await;
        let Ok(Some(Ok(msg))) = next else { break };
        let Ok(v) = serde_json::from_str::<Value>(&msg.to_string()) else { continue };
        match v["method"].as_str().unwrap_or("") {
            "Runtime.exceptionThrown" => {
                let d = &v["params"]["exceptionDetails"];
                let text = d["exception"]["description"]
                    .as_str()
                    .or_else(|| d["text"].as_str())
                    .unwrap_or("uncaught exception");
                let line = d["lineNumber"].as_u64().map(|n| n + 1).unwrap_or(0);
                let src = d["url"].as_str().unwrap_or("");
                let first = text.lines().next().unwrap_or(text);
                errors.push(if src.is_empty() {
                    first.to_string()
                } else {
                    format!("{first}  ({}:{line})", src.rsplit('/').next().unwrap_or(src))
                });
            }
            "Runtime.consoleAPICalled" => {
                let level = v["params"]["type"].as_str().unwrap_or("log");
                if level != "error" && level != "warning" {
                    continue;
                }
                let text = v["params"]["args"]
                    .as_array()
                    .map(|a| {
                        a.iter()
                            .filter_map(|x| {
                                x["value"].as_str().map(String::from).or_else(|| {
                                    x["description"].as_str().map(String::from)
                                })
                            })
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .unwrap_or_default();
                if text.is_empty() {
                    continue;
                }
                if level == "error" {
                    errors.push(text);
                } else {
                    warnings.push(text);
                }
            }
            "Log.entryAdded" => {
                let e = &v["params"]["entry"];
                let text = e["text"].as_str().unwrap_or("").to_string();
                if text.is_empty() {
                    continue;
                }
                // The browser asks for /favicon.ico unprompted; its 404 is not
                // the page's fault and must not read as a JavaScript error.
                if e["url"].as_str().unwrap_or("").contains("favicon") {
                    continue;
                }
                match e["level"].as_str().unwrap_or("") {
                    "error" => errors.push(text),
                    "warning" => warnings.push(text),
                    _ => {}
                }
            }
            "Network.responseReceived" => {
                let status = v["params"]["response"]["status"].as_u64().unwrap_or(200);
                if status >= 400 {
                    let u = v["params"]["response"]["url"].as_str().unwrap_or("");
                    failed.push(format!("{status} {u}"));
                }
            }
            "Network.loadingFailed" => {
                let u = v["params"]["errorText"].as_str().unwrap_or("request failed");
                failed.push(u.to_string());
            }
            _ => {}
        }
    }

    // What actually ended up on screen.
    // Probe the page WITHOUT touching any canvas context: calling getContext on
    // a canvas creates one if absent, which can stop the page's own renderer
    // from ever attaching. Only geometry is read here; whether anything was
    // drawn is answered by screenshotting the canvas region instead.
    let probe = r#"(() => {
        let webgl = 'unknown';
        try {
            const t = document.createElement('canvas');
            webgl = (t.getContext('webgl2') || t.getContext('webgl')) ? 'available' : 'unavailable';
        } catch (e) { webgl = 'unavailable'; }
        const cs = [...document.querySelectorAll('canvas')].map(c => {
            const r = c.getBoundingClientRect();
            return { w: c.width, h: c.height,
                     x: Math.round(r.x), y: Math.round(r.y),
                     cw: Math.round(r.width), ch: Math.round(r.height) };
        });
        const text = (document.body ? document.body.innerText : '').trim();
        return JSON.stringify({
            title: document.title,
            webgl,
            visible_text_chars: text.length,
            text_preview: text.slice(0, 300),
            elements: document.querySelectorAll('*').length,
            canvases: cs,
            images_broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length
        });
    })()"#;
    let probe_id = cdp!("Runtime.evaluate", json!({"expression": probe, "returnByValue": true}));

    let mut stats = json!({});
    let probe_deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    while tokio::time::Instant::now() < probe_deadline {
        let Ok(Some(Ok(msg))) = tokio::time::timeout_at(probe_deadline, ws.next()).await else { break };
        let Ok(v) = serde_json::from_str::<Value>(&msg.to_string()) else { continue };
        if v["id"].as_u64() == Some(probe_id) {
            if let Some(s) = v["result"]["result"]["value"].as_str() {
                stats = serde_json::from_str(s).unwrap_or_else(|_| json!({}));
            }
            break;
        }
    }

    // For a WebGL canvas the 2D pixel probe cannot work, so use the rendered
    // frame itself: a blank viewport compresses to almost nothing, a real scene
    // does not. Crude, but it separates "drew something" from "drew nothing".
    let clip = stats["canvases"].as_array().and_then(|a| a.first()).and_then(|c| {
        let (w, h) = (c["cw"].as_f64().unwrap_or(0.0), c["ch"].as_f64().unwrap_or(0.0));
        (w >= 20.0 && h >= 20.0).then(|| json!({
            "x": c["x"].as_f64().unwrap_or(0.0), "y": c["y"].as_f64().unwrap_or(0.0),
            "width": w, "height": h, "scale": 1
        }))
    });
    let shot_params = match &clip {
        Some(c) => json!({"format": "png", "clip": c}),
        None => json!({"format": "png"}),
    };
    let shot_is_canvas = clip.is_some();
    let shot_id = cdp!("Page.captureScreenshot", shot_params);
    let mut shot_bytes: Option<usize> = None;
    let mut framing: Option<Framing> = None;
    let shot_deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    while tokio::time::Instant::now() < shot_deadline {
        let Ok(Some(Ok(msg))) = tokio::time::timeout_at(shot_deadline, ws.next()).await else { break };
        let Ok(v) = serde_json::from_str::<Value>(&msg.to_string()) else { continue };
        if v["id"].as_u64() == Some(shot_id) {
            if let Some(b64) = v["result"]["data"].as_str() {
                shot_bytes = Some(b64.len() * 3 / 4);
                framing = analyse_frame(b64);
            }
            break;
        }
    }

    let title = stats["title"].as_str().unwrap_or("").to_string();
    // A favicon nobody asked for is not a page bug.
    failed.retain(|f| !f.contains("favicon"));
    errors.retain(|e| !e.contains("favicon"));
    errors.dedup();
    warnings.dedup();
    failed.dedup();

    // Separate "this browser cannot do WebGL" from "this page is broken", so a
    // headless limitation never gets reported as the author's mistake.
    let is_webgl_env = |e: &String| {
        let l = e.to_lowercase();
        l.contains("webgl") && (l.contains("context") || l.contains("unavailable") || l.contains("swiftshader") || l.contains("gpu"))
    };
    let webgl_env: Vec<String> = errors.iter().filter(|e| is_webgl_env(e)).cloned().collect();
    errors.retain(|e| !is_webgl_env(e));
    Ok(Report { title, errors, warnings, failed_requests: failed, stats, webgl_env, shot_bytes, shot_is_canvas, framing })
}
