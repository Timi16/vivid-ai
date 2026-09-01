//! Where the engine lives. Precedence: CLI flag > env > ~/.vivid/config.toml.
//! The model id is discovered from the endpoint when it is not configured, so
//! no vendor string is ever baked into Vivid Code.
//!
//! That endpoint is the Vivid backend, not a pod. Vivid Code used to ship the
//! address of a RunPod proxy, which meant an unauthenticated GPU on the open
//! internet, a re-release every time a pod moved, and no way to tell whose
//! work any of the traffic was. The backend answers the same OpenAI shape,
//! resolves `vivid-code` to whichever pod currently serves it, and knows who
//! is asking.
use anyhow::{anyhow, Result};
use serde::Deserialize;

use crate::auth;

/// The backend's OpenAI-compatible root. Deployment-specific, so this is the
/// local one: point `VIVID_URL` (or `url` in ~/.vivid/config.toml) at your
/// deployment. There is deliberately no hosted address baked in — the last one
/// outlived the pod it named.
pub const DEFAULT_URL: &str = "http://localhost:8000/v1";
/// The design brief goes to the assistant model, which has better taste than
/// the coder. Same endpoint, different alias — one backend serves both.
pub const DEFAULT_DESIGN_MODEL: &str = "vivid-chat";

#[derive(Debug, Clone)]
pub struct Config {
    pub url: String,
    pub model: Option<String>,
    pub stream: bool,
    /// Prompt-token level at which old tool output gets compacted.
    pub context_budget: u32,
    /// True when the user pinned context_budget themselves.
    pub context_budget_explicit: bool,
    /// Endpoint of the model that writes design briefs (the chat pod).
    pub design_url: Option<String>,
    pub design_model: Option<String>,
    /// Ceiling on one reply. A whole HTML page inside a single write_file call
    /// is easily 5k tokens; too low a cap truncates the JSON mid-argument.
    pub max_reply_tokens: u32,
}

#[derive(Deserialize, Default)]
struct FileConfig {
    url: Option<String>,
    model: Option<String>,
    context_budget: Option<u32>,
    max_reply_tokens: Option<u32>,
    design_url: Option<String>,
    design_model: Option<String>,
}

impl Config {
    pub fn load(url_flag: Option<String>, model_flag: Option<String>, stream: bool, design_flag: Option<String>) -> Self {
        let file = dirs::home_dir()
            .map(|h| h.join(".vivid").join("config.toml"))
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| toml::from_str::<FileConfig>(&s).ok())
            .unwrap_or_default();

        let url = url_flag
            .or_else(|| std::env::var("VIVID_URL").ok())
            .or_else(|| std::env::var("VIVID_LLM_URL").ok())
            .or(file.url)
            .unwrap_or_else(|| DEFAULT_URL.to_string());
        let model = model_flag
            .or_else(|| std::env::var("VIVID_MODEL").ok())
            .or(file.model);
        let url = if url.ends_with("/v1") { url } else { format!("{}/v1", url.trim_end_matches('/')) };
        Config {
            url: url.clone(),
            model,
            stream,
            context_budget: file.context_budget.unwrap_or(24_000),
            context_budget_explicit: file.context_budget.is_some(),
            max_reply_tokens: file.max_reply_tokens.unwrap_or(16_000),
            // Design briefs come from the same backend by default; only a
            // deployment that puts the two models behind different hosts needs
            // to say so.
            design_url: design_flag
                .or_else(|| std::env::var("VIVID_DESIGN_URL").ok())
                .or(file.design_url)
                .or_else(|| Some(url.clone())),
            design_model: std::env::var("VIVID_DESIGN_MODEL")
                .ok()
                .or(file.design_model)
                .or_else(|| Some(DEFAULT_DESIGN_MODEL.to_string())),
        }
    }
}

impl Config {
    /// Scale the compaction threshold to the engine's real window, leaving
    /// room for the reply. An explicit context_budget in config.toml wins.
    pub fn with_engine_context(mut self, engine_ctx: Option<u32>) -> Self {
        if self.context_budget_explicit {
            return self;
        }
        if let Some(ctx) = engine_ctx {
            let room = ctx.saturating_sub(self.max_reply_tokens + 2_000);
            self.context_budget = room.clamp(8_000, 200_000);
        }
        self
    }
}

/// Ask the endpoint which model it is serving, and how much context it has.
/// Retries: a pod that is still booting answers with a holding page or nothing
/// at all, and that should mean "wait", not "give up before we started".
pub async fn discover(base: &str) -> Result<(String, Option<u32>)> {
    let mut last: Option<anyhow::Error> = None;
    for attempt in 1..=6u32 {
        match discover_once(base).await {
            Ok(v) => return Ok(v),
            Err(e) if auth::is_auth_failure(&e) => return Err(e),
            Err(e) => {
                if attempt < 6 {
                    let wait = std::time::Duration::from_millis(500u64 << (attempt - 1).min(4));
                    crate::ui::warn(&format!(
                        "engine not ready yet; waiting {:.1}s  [{}/6]",
                        wait.as_secs_f32(),
                        attempt + 1
                    ));
                    tokio::time::sleep(wait).await;
                }
                last = Some(e);
            }
        }
    }
    Err(last.unwrap_or_else(|| anyhow!("the engine could not be reached")))
}

async fn discover_once(base: &str) -> Result<(String, Option<u32>)> {
    let http = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let r = auth::authorize(http.get(format!("{}/models", base.trim_end_matches('/'))))
        .send()
        .await
        .map_err(|e| anyhow!("cannot reach the engine at {base}: {e}"))?;
    let status = r.status();
    let body = r.text().await.unwrap_or_default();
    // Discovery is the first call of every run, so it is where a missing or
    // stale login gets caught. Typed, so the retry loop above stops instead of
    // spending thirty seconds treating "signed out" as "the pod is booting".
    if let Some(explanation) = auth::explain(status, &body) {
        return Err(auth::AuthError(explanation).into());
    }
    // A pod that is asleep or booting answers with an HTML holding page, not JSON.
    if body.trim_start().starts_with('<') {
        return Err(anyhow!(
            "the engine at {base} is not serving yet (HTTP {status} returned a web page, not JSON). \
             The pod is probably still starting — wait for it and try again, or point --url elsewhere."
        ));
    }
    let v: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| anyhow!("engine returned an unexpected response (HTTP {status}): {e}"))?;
    let m = &v["data"][0];
    let id = m["id"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| anyhow!("the engine did not report a model; set one with --model"))?;
    let ctx = m["max_model_len"].as_u64().map(|n| n as u32);
    Ok((id, ctx))
}
