//! Chat client for the Vivid Code engine (OpenAI-compatible HTTP).
//! Streams tokens and assembles tool calls.
use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type", default = "function_type")]
    pub kind: String,
    pub function: FunctionCall,
}

fn function_type() -> String {
    "function".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl Message {
    pub fn system(s: impl Into<String>) -> Self {
        Self { role: "system".into(), content: Some(s.into()), tool_calls: None, tool_call_id: None, name: None }
    }
    pub fn user(s: impl Into<String>) -> Self {
        Self { role: "user".into(), content: Some(s.into()), tool_calls: None, tool_call_id: None, name: None }
    }
    pub fn tool(id: &str, name: &str, content: String) -> Self {
        Self {
            role: "tool".into(),
            content: Some(content),
            tool_calls: None,
            tool_call_id: Some(id.to_string()),
            name: Some(name.to_string()),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct Usage {
    #[serde(default)]
    pub prompt_tokens: u32,
    #[serde(default)]
    pub completion_tokens: u32,
}

pub struct Completion {
    pub message: Message,
    pub usage: Option<Usage>,
    pub finish_reason: Option<String>,
}

/// Transient network failures are common against a hosted pod: a reset
/// connection or a gateway hiccup should not end a build that is going well.
const MAX_ATTEMPTS: u32 = 10;

/// Retry only what a retry can actually fix. Reqwest wraps its causes, so this
/// reads the rendered message rather than matching a dozen concrete types.
fn retryable(e: &anyhow::Error) -> bool {
    let s = format!("{e:#}").to_lowercase();
    [
        "connection reset",
        "connection closed",
        "connection refused",
        "sendrequest",
        "broken pipe",
        "stream read failed",
        "error sending request",
        "timed out",
        "timeout",
        "dns",
        "no address",
        "incomplete message",
        "502",
        "503",
        "504",
        "429",
        "not serving yet",
    ]
    .iter()
    .any(|needle| s.contains(needle))
}

fn backoff(attempt: u32) -> Duration {
    // 0.5s, 1s, 2s, 4s, then hold at 8s.
    let ms = 500u64.saturating_mul(1 << (attempt - 1).min(4));
    Duration::from_millis(ms.min(8_000))
}

pub struct Client {
    http: reqwest::Client,
    base: String,
    model: String,
    stream: bool,
    max_tokens: u32,
}

impl Client {
    pub fn new(base: &str, model: &str, stream: bool, max_tokens: u32) -> Result<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(900))
            .build()?;
        Ok(Self { http, base: base.trim_end_matches('/').to_string(), model: model.to_string(), stream, max_tokens })
    }

    pub async fn chat(
        &self,
        messages: &[Message],
        tools: &[Value],
        on_token: &mut dyn FnMut(&str),
    ) -> Result<Completion> {
        let mut last: Option<anyhow::Error> = None;
        for attempt in 1..=MAX_ATTEMPTS {
            let mut streamed = false;
            let mut watch = |t: &str| {
                streamed = true;
                on_token(t);
            };
            match self.attempt(messages, tools, &mut watch).await {
                Ok(c) => return Ok(c),
                Err(e) => {
                    if !retryable(&e) || attempt == MAX_ATTEMPTS {
                        return Err(e);
                    }
                    let wait = backoff(attempt);
                    crate::ui::warn(&format!(
                        "connection to the engine failed ({}); retrying in {}  [{}/{}]{}",
                        short_cause(&e),
                        human(wait),
                        attempt + 1,
                        MAX_ATTEMPTS,
                        if streamed { " — the reply restarts, so some text repeats" } else { "" }
                    ));
                    tokio::time::sleep(wait).await;
                    last = Some(e);
                }
            }
        }
        Err(last.unwrap_or_else(|| anyhow!("the engine could not be reached")))
    }

    async fn attempt(
        &self,
        messages: &[Message],
        tools: &[Value],
        on_token: &mut dyn FnMut(&str),
    ) -> Result<Completion> {
        let mut body = json!({
            "model": self.model,
            "messages": messages,
            "temperature": 0.15,
            "max_tokens": self.max_tokens,
            "stream": self.stream,
        });
        if !tools.is_empty() {
            body["tools"] = json!(tools);
            body["tool_choice"] = json!("auto");
        }
        if self.stream {
            body["stream_options"] = json!({"include_usage": true});
        }

        let resp = self
            .http
            .post(format!("{}/chat/completions", self.base))
            .json(&body)
            .send()
            .await
            .context("request to the engine failed")?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("engine returned {status}: {}", text.chars().take(600).collect::<String>()));
        }

        let mut completion = if self.stream {
            self.read_stream(resp, on_token).await?
        } else {
            let v: Value = resp.json().await.context("bad JSON from the engine")?;
            let choice = v["choices"].get(0).cloned().unwrap_or(Value::Null);
            let message: Message = serde_json::from_value(choice["message"].clone())
                .context("could not parse assistant message")?;
            if let Some(c) = &message.content {
                on_token(c);
            }
            let usage = serde_json::from_value(v["usage"].clone()).ok();
            Completion { message, usage, finish_reason: choice["finish_reason"].as_str().map(String::from) }
        };

        // Some engines leave raw tool syntax in the text instead of emitting
        // structured calls. Recover it rather than lose the turn.
        if completion.message.tool_calls.as_ref().map_or(true, |t| t.is_empty()) {
            if let Some(text) = completion.message.content.clone() {
                if let Some((calls, rest)) = parse_raw_tool_calls(&text) {
                    completion.message.tool_calls = Some(calls);
                    completion.message.content = if rest.trim().is_empty() { None } else { Some(rest) };
                }
            }
        }
        Ok(completion)
    }

    async fn read_stream(
        &self,
        resp: reqwest::Response,
        on_token: &mut dyn FnMut(&str),
    ) -> Result<Completion> {
        let mut stream = resp.bytes_stream();
        let mut buf = String::new();
        let mut content = String::new();
        let mut calls: Vec<ToolCall> = Vec::new();
        let mut usage: Option<Usage> = None;
        let mut finish_reason: Option<String> = None;

        'outer: while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("stream read failed")?;
            buf.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(pos) = buf.find('\n') {
                let line = buf[..pos].trim().to_string();
                buf.drain(..=pos);
                let Some(data) = line.strip_prefix("data:") else { continue };
                let data = data.trim();
                if data == "[DONE]" {
                    break 'outer;
                }
                let Ok(v) = serde_json::from_str::<Value>(data) else { continue };
                if let Some(u) = v.get("usage").filter(|u| !u.is_null()) {
                    usage = serde_json::from_value(u.clone()).ok();
                }
                let Some(choice) = v["choices"].get(0) else { continue };
                if let Some(r) = choice["finish_reason"].as_str() {
                    finish_reason = Some(r.to_string());
                }
                let delta = &choice["delta"];
                if let Some(t) = delta["content"].as_str() {
                    if !t.is_empty() {
                        content.push_str(t);
                        on_token(t);
                    }
                }
                if let Some(tcs) = delta["tool_calls"].as_array() {
                    for tc in tcs {
                        let idx = tc["index"].as_u64().unwrap_or(calls.len() as u64) as usize;
                        while calls.len() <= idx {
                            calls.push(ToolCall::default());
                        }
                        let slot = &mut calls[idx];
                        if let Some(id) = tc["id"].as_str() {
                            slot.id = id.to_string();
                        }
                        if let Some(n) = tc["function"]["name"].as_str() {
                            slot.function.name.push_str(n);
                        }
                        if let Some(a) = tc["function"]["arguments"].as_str() {
                            slot.function.arguments.push_str(a);
                        }
                    }
                }
            }
        }

        for c in calls.iter_mut() {
            if c.kind.is_empty() {
                c.kind = "function".into();
            }
            if c.id.is_empty() {
                c.id = new_call_id();
            }
        }
        let message = Message {
            role: "assistant".into(),
            content: if content.is_empty() { None } else { Some(content) },
            tool_calls: if calls.is_empty() { None } else { Some(calls) },
            tool_call_id: None,
            name: None,
        };
        Ok(Completion { message, usage, finish_reason })
    }
}

fn human(d: Duration) -> String {
    let ms = d.as_millis();
    if ms < 1_000 { format!("{ms}ms") } else { format!("{:.0}s", d.as_secs_f32()) }
}

/// The deepest cause in the chain — that is the one that says what went wrong.
fn short_cause(e: &anyhow::Error) -> String {
    let full = format!("{e:#}");
    let deepest = full.split(": ").last().unwrap_or(&full).trim();
    deepest.chars().take(80).collect()
}

/// Tool-call ids must be exactly 9 alphanumeric characters.
pub fn new_call_id() -> String {
    use rand::Rng;
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..9).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect()
}

/// Best-effort recovery of tool calls left in plain text.
fn parse_raw_tool_calls(text: &str) -> Option<(Vec<ToolCall>, String)> {
    if !text.contains("[TOOL_CALLS]") {
        return None;
    }
    let re = Regex::new(r"\[TOOL_CALLS\]\s*([A-Za-z0-9_]+)\s*\[ARGS\]\s*(\{.*?\})\s*(?:\[/TOOL_CALLS\])?").ok()?;
    let mut calls = Vec::new();
    for cap in re.captures_iter(text) {
        let args = cap[2].to_string();
        if serde_json::from_str::<Value>(&args).is_err() {
            continue;
        }
        calls.push(ToolCall {
            id: new_call_id(),
            kind: "function".into(),
            function: FunctionCall { name: cap[1].to_string(), arguments: args },
        });
    }
    if calls.is_empty() {
        return None;
    }
    let rest = re.replace_all(text, "").to_string();
    Some((calls, rest))
}
