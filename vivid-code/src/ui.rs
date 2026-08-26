//! What Vivid Code shows. Every write goes through `screen` so the prompt box
//! stays pinned at the bottom while this output scrolls above it.
use crate::jsonio;
use crate::screen;
use owo_colors::OwoColorize;
use serde_json::{json, Value};

pub fn banner(root: &str) {
    if jsonio::enabled() {
        // The editor's cue that the engine resolved and the agent is usable.
        jsonio::emit("ready", json!({"root": root, "version": env!("CARGO_PKG_VERSION")}));
        return;
    }
    screen::line("");
    screen::line(&format!(
        "  {}  {}",
        "Vivid Code".magenta().bold(),
        format!("v{}", env!("CARGO_PKG_VERSION")).dimmed()
    ));
    screen::line(&format!("  {} {}", "dir".dimmed(), root));
    screen::line("");
}

/// Echo the submitted prompt into scrollback, the way the box showed it.
pub fn user_echo(text: &str) {
    if jsonio::enabled() {
        return; // the editor drew the user's own message already
    }
    for (i, line) in text.lines().enumerate() {
        let marker = if i == 0 { "›".magenta().bold().to_string() } else { " ".to_string() };
        screen::line(&format!("{marker} {line}"));
    }
    screen::line("");
}

pub fn busy(label: &str) {
    if jsonio::enabled() {
        jsonio::emit("busy", json!({"label": label}));
        return;
    }
    screen::busy(label);
}

/// A streaming Markdown sink for one assistant reply.
pub struct Reply {
    md: crate::markdown::Md,
    started: bool,
    /// The ● marker belongs to the first line of the reply. It used to be
    /// written on its own, and clearing the unfinished line to emit that first
    /// line wiped it — so it rides along with the text instead.
    marked: bool,
}

impl Reply {
    pub fn new() -> Self {
        Self { md: crate::markdown::Md::new(), started: false, marked: false }
    }

    fn mark() -> String {
        format!("{} ", "●".magenta().bold())
    }

    pub fn token(&mut self, t: &str) {
        if jsonio::enabled() {
            // Raw tokens: the editor renders its own markdown.
            self.started = true;
            jsonio::emit("token", json!({"text": t}));
            return;
        }
        self.started = true;
        let (lines, tail) = self.md.push(t);
        for l in lines {
            screen::set_partial("");
            if self.marked {
                screen::line(&l);
            } else {
                self.marked = true;
                screen::line(&format!("{}{l}", Self::mark()));
            }
        }
        if screen::is_interactive() {
            if self.marked {
                screen::set_partial(&tail);
            } else {
                screen::set_partial(&format!("{}{tail}", Self::mark()));
            }
        }
    }

    pub fn finish(&mut self) {
        if jsonio::enabled() {
            if self.started {
                jsonio::emit("reply_end", json!({}));
            }
            return;
        }
        if let Some(last) = self.md.finish() {
            screen::set_partial("");
            if self.marked {
                screen::line(&last);
            } else {
                self.marked = true;
                screen::line(&format!("{}{last}", Self::mark()));
            }
        } else if self.started {
            screen::set_partial("");
            screen::line("");
        }
    }

    pub fn started(&self) -> bool {
        self.started
    }
}

fn short(v: &Value, max: usize) -> String {
    let s = match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    let s = s.replace('\n', "⏎ ");
    if s.chars().count() > max {
        format!("{}…", s.chars().take(max).collect::<String>())
    } else {
        s
    }
}

pub fn tool_call(name: &str, args: &Value) {
    if jsonio::enabled() {
        jsonio::emit("tool_call", json!({"name": name, "args": args}));
        return;
    }
    let mut parts = Vec::new();
    if let Some(obj) = args.as_object() {
        for (k, v) in obj {
            if k == "content" || k == "new_string" || k == "old_string" {
                let n = v.as_str().map(|s| s.lines().count()).unwrap_or(0);
                parts.push(format!("{k}=<{n} lines>"));
            } else {
                parts.push(format!("{k}={}", short(v, 90)));
            }
        }
    }
    screen::line(&format!("{} {} {}", "▶".cyan().bold(), name.cyan().bold(), parts.join(" ").dimmed()));
}

pub fn tool_result(text: &str) {
    if jsonio::enabled() {
        jsonio::emit("tool_result", json!({"text": text}));
        return;
    }
    let lines: Vec<&str> = text.lines().collect();
    for l in lines.iter().take(4) {
        let l = l.trim_end();
        let l = if l.chars().count() > 110 {
            format!("{}…", l.chars().take(110).collect::<String>())
        } else {
            l.to_string()
        };
        screen::line(&format!("  {}", l.dimmed()));
    }
    if lines.len() > 4 {
        screen::line(&format!("  {}", format!("… ({} lines)", lines.len()).dimmed()));
    }
}

pub fn diff(path: &str, old: &str, new: &str) {
    if jsonio::enabled() {
        // Both sides, unrendered: VS Code shows a real diff editor with them,
        // which is the whole reason to run the agent inside an editor.
        jsonio::emit("diff", json!({"path": path, "old": old, "new": new}));
        return;
    }
    use similar::{ChangeTag, TextDiff};
    screen::line(&format!("  {} {}", "diff".yellow(), path.yellow()));
    let d = TextDiff::from_lines(old, new);
    let mut shown = 0;
    for change in d.iter_all_changes() {
        let line = change.to_string();
        let line = line.trim_end();
        match change.tag() {
            ChangeTag::Delete => screen::line(&format!("  {}", format!("- {line}").red())),
            ChangeTag::Insert => screen::line(&format!("  {}", format!("+ {line}").green())),
            ChangeTag::Equal => continue,
        }
        shown += 1;
        if shown >= 40 {
            screen::line(&format!("  {}", "… (diff truncated)".dimmed()));
            break;
        }
    }
}

/// Ask a yes/no question in the box. Reading a line from stdin here used to
/// pick up the newline left over from submitting the prompt, so the first
/// answer was always read as "no" — this consumes real key events instead.
pub fn confirm(question: &str) -> bool {
    if jsonio::enabled() {
        return jsonio::confirm(question, json!(null));
    }
    use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
    use crossterm::terminal::{disable_raw_mode, enable_raw_mode};
    use std::time::Duration;

    if !screen::is_interactive() {
        return true; // one-shot runs are non-interactive by definition
    }
    screen::ask(question);
    if enable_raw_mode().is_err() {
        return false;
    }
    // Anything typed before the question appeared is not an answer to it.
    while event::poll(Duration::ZERO).unwrap_or(false) {
        let _ = event::read();
    }
    let mut yes = false;
    loop {
        match event::read() {
            Ok(Event::Key(k)) if k.kind != KeyEventKind::Release => match k.code {
                KeyCode::Char('y') | KeyCode::Char('Y') => {
                    yes = true;
                    break;
                }
                KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc | KeyCode::Enter => break,
                KeyCode::Char('c') if k.modifiers.contains(KeyModifiers::CONTROL) => break,
                _ => {}
            },
            Ok(_) => {}
            Err(_) => break,
        }
    }
    let _ = disable_raw_mode();
    screen::line(&format!(
        "{} {} {}",
        "?".yellow().bold(),
        question,
        if yes { "yes".green().to_string() } else { "no".red().to_string() }
    ));
    yes
}

/// One line of live output from a running command.
pub fn stream_line(text: &str, is_err: bool) {
    if jsonio::enabled() {
        jsonio::emit("stream", json!({"text": text, "is_err": is_err}));
        return;
    }
    let t = text.trim_end();
    let t: String = if t.chars().count() > 140 {
        format!("{}…", t.chars().take(140).collect::<String>())
    } else {
        t.to_string()
    };
    if is_err {
        screen::line(&format!("  {}", t.yellow().dimmed()));
    } else {
        screen::line(&format!("  {}", t.dimmed()));
    }
}

pub fn usage(prompt: u32, completion: u32, budget: u32) {
    if jsonio::enabled() {
        jsonio::emit("usage", json!({"prompt": prompt, "completion": completion, "budget": budget}));
        return;
    }
    screen::line(&format!("{}", format!("  ⋯ {prompt} in / {completion} out (budget {budget})").dimmed()));
}

pub fn info(msg: &str) {
    if jsonio::enabled() {
        jsonio::emit("info", json!({"message": msg}));
        return;
    }
    screen::line(&format!("{} {}", "i".blue().bold(), msg));
}

pub fn warn(msg: &str) {
    if jsonio::enabled() {
        jsonio::emit("warn", json!({"message": msg}));
        return;
    }
    screen::line(&format!("{} {}", "!".yellow().bold(), msg.yellow()));
}

pub fn error(msg: &str) {
    if jsonio::enabled() {
        jsonio::emit("error", json!({"message": msg}));
        return;
    }
    screen::line(&format!("{} {}", "✗".red().bold(), msg.red()));
}

pub fn help() {
    if jsonio::enabled() {
        return;
    }
    for (cmd, what) in [
        ("/stop  ", "stop the running dev server"),
        ("/logs  ", "show the server's recent output"),
        ("/clear ", "start a fresh conversation"),
        ("/help  ", "this list"),
        ("/quit  ", "exit"),
    ] {
        screen::line(&format!("  {}   {}", cmd.cyan(), what.dimmed()));
    }
}
