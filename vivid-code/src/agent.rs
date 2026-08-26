//! The loop: ask the model, run what it asks for, feed the results back, repeat.
use crate::llm::{Client, Message};
use crate::tools::{self, Ctx};
use crate::ui;
use anyhow::Result;
use std::collections::HashMap;

fn signature(name: &str, args: &Value) -> String {
    format!("{name}|{}", args)
}

fn screen_is_live() -> bool {
    crate::screen::is_interactive()
}
use serde_json::{json, Value};

pub struct Agent {
    llm: Client,
    designer: Option<crate::brief::Designer>,
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
        Self { llm, designer: None, ctx, messages, system, yolo, max_iter, context_budget }
    }

    pub fn set_designer(&mut self, d: Option<crate::brief::Designer>) {
        self.designer = d;
    }

    pub fn reset(&mut self) {
        self.messages = vec![Message::system(self.system.clone())];
    }

    pub fn ctx(&self) -> &Ctx {
        &self.ctx
    }

    /// Every assistant tool_call must be answered by exactly one tool message.
    /// Anything that interrupts the loop mid-call — a dropped connection, a
    /// cancel — can leave one dangling, and the engine then refuses the whole
    /// conversation. Answer the orphans instead of losing the session.
    fn repair_history(&mut self) {
        let mut repaired: Vec<Message> = Vec::with_capacity(self.messages.len());
        for (i, m) in self.messages.iter().enumerate() {
            repaired.push(m.clone());
            let Some(calls) = m.tool_calls.as_ref().filter(|c| !c.is_empty()) else { continue };
            // Collect the ids already answered in the run of tool messages that follows.
            let mut answered: Vec<String> = Vec::new();
            for later in self.messages[i + 1..].iter() {
                if later.role != "tool" {
                    break;
                }
                if let Some(id) = later.tool_call_id.clone() {
                    answered.push(id);
                }
            }
            for c in calls {
                if !answered.contains(&c.id) {
                    repaired.push(Message::tool(
                        &c.id,
                        &c.function.name,
                        "This call did not complete — the connection to the engine dropped before \
                         the result came back. Nothing was changed by it. Run it again if you still \
                         need it."
                            .to_string(),
                    ));
                }
            }
        }
        if repaired.len() != self.messages.len() {
            ui::info(&format!(
                "recovered {} unanswered tool call(s) from the interrupted turn",
                repaired.len() - self.messages.len()
            ));
            self.messages = repaired;
        }
    }

    pub async fn run_turn(&mut self, user: &str) -> Result<()> {
        self.repair_history();

        // Hand the request to the design model first. It returns PASS for
        // anything without a visual surface, so bug fixes and questions go
        // straight through untouched.
        let mut user = user.to_string();
        if let Some(d) = &self.designer {
            ui::busy("writing the design brief");
            match d.brief(&user).await {
                Ok(Some(enriched)) => {
                    if let Some(body) = enriched.split("DIRECTION").nth(1) {
                        let line = body.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
                        ui::info(&format!("brief: {}", line.chars().take(150).collect::<String>()));
                    }
                    user = enriched;
                }
                Ok(None) => {}
                Err(e) => ui::warn(&format!("design brief skipped ({e})")),
            }
        }
        let user = user.as_str();

        self.messages.push(Message::user(user));
        let schemas = tools::schemas();
        // Identical calls and identical failures, counted for this turn. A
        // small model will happily repeat a no-op fix forever; telling it not
        // to in the prompt is not enough, so the harness refuses to run it.
        let mut seen_calls: HashMap<String, usize> = HashMap::new();
        let mut seen_errors: HashMap<String, usize> = HashMap::new();
        let mut refusals = 0usize;

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
                    // Do NOT drop the last message here. It is only the user's
                    // turn on the first pass; after a tool call it is the tool
                    // RESULT, and removing it leaves an assistant tool_call
                    // with no response — which the engine rejects on every
                    // later request ("Not the same number of function calls and
                    // responses"), killing the session rather than the turn.
                    ui::error(&format!("{e:#}"));
                    ui::info("the conversation is intact — say \"continue\" to pick up where it stopped");
                    return Ok(());
                }
            };

            let calls = completion.message.tool_calls.clone().unwrap_or_default();
            // A reply cut off at the token cap leaves half-written JSON in the
            // tool call. Sending that back poisons the whole conversation: the
            // engine rejects every later request with "Unterminated string" and
            // the session is dead. Replace unparseable arguments with valid
            // empty JSON before this message joins the history.
            let mut assistant = completion.message.clone();
            if let Some(tcs) = assistant.tool_calls.as_mut() {
                for tc in tcs.iter_mut() {
                    if serde_json::from_str::<Value>(&tc.function.arguments).is_err() {
                        tc.function.arguments = "{}".to_string();
                    }
                }
            }
            self.messages.push(assistant);

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
                let sig = signature(&name, &args);
                let repeats = { let c = seen_calls.entry(sig.clone()).or_insert(0); *c += 1; *c };
                if repeats > 2 {
                    refusals += 1;
                    // Refusing is not enough on its own: told "no", the model
                    // simply asked again, thirty times. After a few, the turn
                    // ends — a stuck agent must stop, not spin.
                    if refusals >= 3 {
                        ui::error(&format!(
                            "stuck: {name} was called with identical arguments {} times. Stopping this turn.",
                            repeats
                        ));
                        ui::info("try rephrasing, or run /clear and give it a smaller step");
                        return Ok(());
                    }
                    let msg = format!(
                        "REFUSED: you have already run this exact {name} call {} times and the \
                         result did not change. Repeating it cannot help, and repeating it again \
                         will end this turn. Do something different: re-read the file to see what it \
                         actually contains now, try another approach, or tell the user what is \
                         blocking you.",
                        repeats - 1
                    );
                    ui::tool_call(&name, &json!({"refused": "identical call repeated"}));
                    ui::tool_result(&msg);
                    self.messages.push(Message::tool(&call.id, &name, msg));
                    continue;
                }
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
                // Verifying again after a change is not a repeat — the file or
                // the server is different now. Only calls made with nothing
                // altered in between count towards the loop detector, or the
                // edit → check → edit → check cycle gets blocked as thrashing.
                if approved && tools::mutates(&name, &args) && !result.starts_with("ERROR") {
                    seen_calls.clear();
                }
                // The same failure arriving again and again means the approach
                // is wrong, not that the fix needs another go.
                let mut result = result;
                let fail_key: Option<String> = result
                    .lines()
                    .find(|l| l.contains("ERROR") || l.contains("SyntaxError") || l.contains("Error:"))
                    .map(|l| l.chars().take(120).collect());
                if let Some(k) = fail_key {
                    let n = { let c = seen_errors.entry(k.clone()).or_insert(0); *c += 1; *c };
                    if n >= 3 {
                        result.push_str(&format!(
                            "\n\nThis is the {n}th time this same failure has come back. Whatever you \
                             are changing is not the cause. Read the whole file, find what actually \
                             produces it, and if you still cannot see it, stop and tell the user what \
                             you tried and what you think is wrong.\n"
                        ));
                    }
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
