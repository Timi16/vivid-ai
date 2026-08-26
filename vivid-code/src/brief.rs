//! Two models, each doing what it is better at.
//!
//! The coding model executes a spec well but reaches for the same safe visual
//! defaults every time. The chat model has far better taste and far worse
//! discipline. So the request goes to the chat model first to become a real
//! design brief, and the coding model builds that instead of the bare prompt.
//!
//! The brief-writer answers PASS for anything without a visual surface, and
//! the request is then passed through untouched.
use anyhow::Result;
use serde_json::json;
use std::time::Duration;

const BRIEF_PROMPT: &str = include_str!("../prompts/brief.md");

pub struct Designer {
    http: reqwest::Client,
    base: String,
    model: String,
}

impl Designer {
    pub fn new(base: &str, model: Option<String>) -> Result<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(180))
            .build()?;
        let base = base.trim_end_matches('/').to_string();
        let base = if base.ends_with("/v1") { base } else { format!("{base}/v1") };
        Ok(Self { http, base, model: model.unwrap_or_default() })
    }

    /// Resolve the served model name when none was configured.
    pub async fn resolve_model(&mut self) -> Result<()> {
        if !self.model.is_empty() {
            return Ok(());
        }
        let v: serde_json::Value =
            self.http.get(format!("{}/models", self.base)).send().await?.json().await?;
        self.model = v["data"][0]["id"].as_str().unwrap_or_default().to_string();
        Ok(())
    }

    /// Returns an enriched brief, or None when the request needs no design work.
    pub async fn brief(&self, request: &str) -> Result<Option<String>> {
        let body = json!({
            "model": self.model,
            "messages": [
                {"role": "system", "content": BRIEF_PROMPT},
                {"role": "user", "content": request},
            ],
            "temperature": 0.8,
            "max_tokens": 1400,
        });
        let r = self.http.post(format!("{}/chat/completions", self.base)).json(&body).send().await?;
        if !r.status().is_success() {
            return Ok(None); // the designer is optional; never block the build
        }
        let v: serde_json::Value = r.json().await?;
        let text = v["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_string();

        if text.is_empty() || text.starts_with("PASS") || !text.contains("DIRECTION") {
            return Ok(None);
        }
        Ok(Some(format!(
            "{request}\n\n\
             ---\n\
             A design brief for this request, written by the studio. Follow it: it decides the \
             look, and the BUILD section is the functional contract. Where the brief and your own \
             instincts disagree about appearance, the brief wins. Where BUILD conflicts with \
             anything above, the original request wins.\n\n{text}\n---"
        )))
    }
}
