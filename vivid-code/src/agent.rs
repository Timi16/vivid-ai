//! The loop: ask the model, run what it asks for, feed the results back, repeat.
use crate::llm::{Client, Message};
use crate::tools::{self, Ctx};
use crate::ui;
use anyhow::Result;

fn screen_is_live() -> bool {
    crate::screen::is_interactive()
}
use serde_json::{json, Value};

pub struct Agent {
    llm: Client,
    ctx: Ctx,
    messages: Vec<Message>,
    system: String,
    yolo: bool,
    max_iter: usize,
    context_budget: u32,
}

impl Agent {
    pub fn new(llm: Client, ctx: Ctx, system: String, yolo: bool, max_iter: usize, context_budget: u32) -> Self {
        let messages = vec![Message::system(system.clone())];
        Self { llm, ctx, messages, system, yolo, max_iter, context_budget }
    }

    pub fn reset(&mut self) {
        self.messages = vec![Message::system(self.system.clone())];
    }

    pub fn ctx(&self) -> &Ctx {
        &self.ctx
    }

    pub async fn run_turn(&mut self, user: &str) -> Result<()> {
        self.messages.push(Message::user(user));
        let schemas = tools::schemas();

        for _ in 0..self.max_iter {
            ui::busy("thinking");
            let mut reply = ui::Reply::new();
            let completion = self
                .llm
                .chat(&self.messages, &schemas, &mut |t| {
                    if !reply.started() {
                        ui::busy("responding");
                    }
                    reply.token(t);
                })
                .await;
            reply.finish();
            let completion = match completion {
                Ok(c) => c,
                Err(e) => {
                    ui::error(&format!("{e:#}"));
                    self.messages.pop();
                    return Ok(());
                }
            };

            let calls = completion.message.tool_calls.clone().unwrap_or_default();
            self.messages.push(completion.message);

            if let Some(u) = &completion.usage {
                ui::usage(u.prompt_tokens, u.completion_tokens, self.context_budget);
                if u.prompt_tokens > self.context_budget {
                    self.compact();
                }
            }
            if completion.finish_reason.as_deref() == Some("length") {
                ui::warn("reply was cut off by max_tokens");
            }
            if calls.is_empty() {
                return Ok(());
            }

            let truncated = completion.finish_reason.as_deref() == Some("length");
            for call in calls {
                let name = call.function.name.clone();
                let parsed = serde_json::from_str::<Value>(&call.function.arguments);
                // A reply cut off at max_tokens leaves the arguments JSON
                // half-written. Say exactly that, so the model writes less
                // instead of silently retrying the same oversized call.
                if parsed.is_err() {
                    let why = if truncated {
                        format!("ERROR: your {name} call was cut off because the reply hit the length limit, \
                                 so the arguments never finished. Write a SHORTER file: split the work into \
                                 several smaller write_file calls (the HTML first, then styles.css on its \
                                 own) and keep each one under about 150 lines.")
                    } else {
                        format!("ERROR: the arguments for {name} were not valid JSON. Send the call again \
                                 with well-formed arguments.")
                    };
                    ui::tool_call(&name, &json!({"error": "arguments incomplete"}));
                    ui::tool_result(&why);
                    self.messages.push(Message::tool(&call.id, &name, why));
                    continue;
                }
                let args = parsed.unwrap();
                ui::tool_call(&name, &args);
                // Name the actual work in the spinner, not just the tool.
                let label = match name.as_str() {
                    "bash" => args["command"].as_str().unwrap_or("bash").chars().take(48).collect::<String>(),
                    "start_server" => format!("starting {}", args["command"].as_str().unwrap_or("server")),
                    "serve_static" => "serving files".to_string(),
                    "http_request" => format!("GET {}", args["path"].as_str().unwrap_or("/")),
                    other => other.to_string(),
                };
                ui::busy(&label);

                let ask = format!(
                    "run  {}",
                    args["command"].as_str().unwrap_or("this command").chars().take(70).collect::<String>()
                );
                let approved = !tools::needs_approval(&name) || self.yolo || ui::confirm(&ask);
                let result = if !approved {
                    "The user declined to run this command. Ask them what to do instead, or try another approach.".to_string()
                } else {
                    // Answering the question replaces the box; put the spinner back.
                    ui::busy(&label);
                    match tools::run(&name, &args, &self.ctx).await {
                        Ok(s) => s,
                        Err(e) => format!("ERROR: {e:#}"),
                    }
                };
                // bash already printed its output live; don't echo it again.
                if !(approved && tools::streams_output(&name) && screen_is_live()) {
                    ui::tool_result(&result);
                }
                self.messages.push(Message::tool(&call.id, &name, result));
            }
        }
        ui::warn(&format!("stopped after {} steps without finishing — ask Vivid to continue", self.max_iter));
        Ok(())
    }

    /// Old tool output is the bulk of the context. Keep the last few turns
    /// intact and shrink everything older to a stub so a 32k window lasts.
    fn compact(&mut self) {
        let keep_from = self.messages.len().saturating_sub(8);
        let mut saved = 0usize;
        for m in self.messages.iter_mut().take(keep_from) {
            if m.role == "tool" {
                if let Some(c) = &m.content {
                    if c.len() > 400 {
                        let head: String = c.chars().take(200).collect();
                        saved += c.len() - head.len();
                        m.content = Some(format!("{head}\n… [earlier output trimmed to save context; re-run the tool if you need it]"));
                    }
                }
            }
        }
        if saved > 0 {
            ui::info(&format!("compacted context (~{} chars of old tool output)", saved));
        }
    }
}
