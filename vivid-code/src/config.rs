//! Where the engine lives. Precedence: CLI flag > env > ~/.vivid/config.toml.
//! The model id is discovered from the endpoint when it is not configured, so
//! no vendor string is ever baked into Vivid Code.
use anyhow::{anyhow, Result};
use serde::Deserialize;

pub const DEFAULT_URL: &str = "https://8bkjp6ojhgy5u1-8000.proxy.runpod.net/v1";

#[derive(Debug, Clone)]
pub struct Config {
    pub url: String,
    pub model: Option<String>,
    pub stream: bool,
    /// Prompt-token level at which old tool output gets compacted.
    pub context_budget: u32,
    /// True when the user pinned context_budget themselves.
    pub context_budget_explicit: bool,
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
}

impl Config {
    pub fn load(url_flag: Option<String>, model_flag: Option<String>, stream: bool) -> Self {
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
            url,
            model,
            stream,
            context_budget: file.context_budget.unwrap_or(24_000),
            context_budget_explicit: file.context_budget.is_some(),
            max_reply_tokens: file.max_reply_tokens.unwrap_or(12_000),
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
pub async fn discover(base: &str) -> Result<(String, Option<u32>)> {
    let http = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let r = http
        .get(format!("{}/models", base.trim_end_matches('/')))
        .send()
        .await
        .map_err(|e| anyhow!("cannot reach the engine at {base}: {e}"))?;
    let status = r.status();
    let body = r.text().await.unwrap_or_default();
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
