mod agent;
mod brief;
mod browser;
mod config;
mod input;
mod jsonio;
mod llm;
mod markdown;
mod process;
mod prompt;
mod screen;
mod static_server;
mod tools;
mod ui;

use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Vivid Code — a coding agent in your terminal.
#[derive(Parser, Debug)]
#[command(name = "vivid", version, about)]
struct Args {
    /// What to build. Omit for an interactive session.
    prompt: Option<String>,
    /// Project directory (default: current directory)
    #[arg(short, long)]
    dir: Option<PathBuf>,
    /// Engine endpoint (…/v1). Also VIVID_URL or ~/.vivid/config.toml
    #[arg(long)]
    url: Option<String>,
    /// Engine model id (discovered automatically when omitted). Also VIVID_MODEL
    #[arg(long)]
    model: Option<String>,
    /// Run shell commands without asking
    #[arg(long)]
    yolo: bool,
    /// Disable streaming (debugging)
    #[arg(long)]
    no_stream: bool,
    /// Max tool steps per turn
    #[arg(long, default_value_t = 60)]
    max_iter: usize,
    /// Endpoint of the model that writes design briefs before building.
    /// Also VIVID_DESIGN_URL or design_url in ~/.vivid/config.toml
    #[arg(long, value_name = "URL")]
    design_url: Option<String>,
    /// Build straight from your words, with no design brief step
    #[arg(long)]
    no_design: bool,
    /// Show the model's reasoning as it works (on by default; --no-think hides it)
    #[arg(long)]
    think: bool,
    /// Hide the reasoning and keep replies terse
    #[arg(long)]
    no_think: bool,
    /// Speak NDJSON on stdout and take requests on stdin instead of drawing a
    /// TUI. This is how the editor extension drives Vivid Code.
    #[arg(long)]
    json: bool,
    /// Open a URL in a headless browser and report JS errors, then exit.
    /// No model involved: `vivid --check http://localhost:3000`
    #[arg(long, value_name = "URL")]
    check: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    if args.json {
        jsonio::enable();
    }
    let root = args.dir.clone().unwrap_or(std::env::current_dir()?);
    std::fs::create_dir_all(&root)?;
    let root = root.canonicalize()?;

    if let Some(url) = args.check.clone() {
        let url = if url.contains("://") { url } else { format!("http://{url}") };
        println!();
        match browser::inspect(&url, 1500).await {
            Ok(r) => {
                println!("  {url}");
                println!("  title: {}", if r.title.is_empty() { "(none)".into() } else { r.title });
                if r.errors.is_empty() {
                    println!("  javascript errors: none");
                } else {
                    println!("  JAVASCRIPT ERRORS ({}):", r.errors.len());
                    for e in &r.errors {
                        println!("    - {}", e.chars().take(300).collect::<String>());
                    }
                }
                for f in &r.failed_requests {
                    println!("  failed request: {f}");
                }
                if let Some(cs) = r.stats["canvases"].as_array() {
                    for (i, c) in cs.iter().enumerate() {
                        println!("  canvas {}: backing {}x{}, on page {}x{}",
                                 i + 1, c["w"], c["h"], c["cw"], c["ch"]);
                    }
                }
                println!("  webgl: {}", r.stats["webgl"].as_str().unwrap_or("?"));
                let blank = r.framing.as_ref().map(|f| f.coverage_pct < 0.4).unwrap_or(false);
                if blank && r.stats["visible_text_chars"].as_u64().unwrap_or(0) < 5 {
                    println!("  PAGE IS BLANK — nothing drawn, no visible text");
                }
                if let Some(f) = &r.framing {
                    if f.dominance > 0.985 {
                        println!("  CANVAS EMPTY — {:.1}% one flat colour", f.dominance * 100.0);
                    }
                    println!("  framing: {:.1}% covered, x {:.0}%–{:.0}%, y {:.0}%–{:.0}%{}",
                             f.coverage_pct, f.left_pct, f.right_pct, f.top_pct, f.bottom_pct,
                             if f.clipped_edges.is_empty() { String::new() }
                             else { format!("  CLIPPED at {}", f.clipped_edges.join("+")) });
                }
                if let Some(b) = r.shot_bytes {
                    let what = if r.shot_is_canvas { "canvas" } else { "viewport" };
                    let verdict = if r.shot_is_canvas && b < 2_500 { "  FLAT — nothing drawn" } else { "" };
                    println!("  {what} screenshot: {b} bytes{verdict}");
                }
                println!("  {} elements, {} chars of visible text",
                         r.stats["elements"], r.stats["visible_text_chars"]);
                println!();
                std::process::exit(if r.errors.is_empty() { 0 } else { 1 });
            }
            Err(e) => {
                eprintln!("  check failed: {e:#}\n");
                std::process::exit(2);
            }
        }
    }

    let cfg = config::Config::load(args.url.clone(), args.model.clone(), !args.no_stream, args.design_url.clone());
    // Ask the engine what it is serving and how big its window is, so moving to
    // a roomier pod widens the budget without editing anything here.
    let (model, engine_ctx) = match cfg.model.clone() {
        Some(m) => (m, None),
        None => match config::discover(&cfg.url).await {
            Ok(v) => v,
            Err(e) => {
                // In JSON mode a bare `?` exits with a stderr line the editor
                // never shows anyone. Say what went wrong on the protocol.
                if args.json {
                    jsonio::emit(
                        "error",
                        serde_json::json!({
                            "code": "engine_unreachable",
                            "message": format!("{e:#}"),
                            "url": cfg.url,
                        }),
                    );
                }
                return Err(e);
            }
        },
    };
    let cfg = cfg.with_engine_context(engine_ctx);
    let llm = llm::Client::new(&cfg.url, &model, cfg.stream, cfg.max_reply_tokens)?;
    let pm = Arc::new(Mutex::new(process::ProcessManager::default()));
    let ctx = tools::Ctx { root: root.clone(), pm: pm.clone(), http: reqwest::Client::new() };
    // Thinking is on unless asked otherwise; --think stays accepted so the
    // flag reads naturally either way.
    let think = args.think || !args.no_think;
    let system = prompt::build(&root, think);
    let mut agent = agent::Agent::new(llm, ctx, system, args.yolo, args.max_iter, cfg.context_budget);

    // The design model is optional: without it, the request goes to the coder
    // exactly as typed.
    let mut designer = None;
    if !args.no_design {
        if let Some(durl) = cfg.design_url.clone() {
            match brief::Designer::new(&durl, cfg.design_model.clone()) {
                Ok(mut d) => {
                    if d.resolve_model().await.is_ok() {
                        designer = Some(d);
                    } else {
                        ui::warn("design model unreachable; building straight from your words");
                    }
                }
                Err(e) => ui::warn(&format!("design model not configured ({e})")),
            }
        }
    }
    agent.set_designer(designer);

    ui::banner(&root.display().to_string());
    if std::env::var("VIVID_DEBUG").is_ok() {
        ui::info(&format!("engine {} · {}", cfg.url, model));
    }

    // `vivid code` is the product's name, not a task — treat it as "no prompt".
    let prompt = args.prompt.filter(|p| !p.trim().eq_ignore_ascii_case("code"));

    if args.json {
        // Headless: one turn per prompt frame, until the editor disconnects.
        // A failing turn is reported and the session stays up — the user will
        // usually just ask again, and losing the conversation would throw away
        // every file the model has already read.
        if let Some(p) = prompt {
            run_json_turn(&mut agent, &p).await;
        }
        while let Some(line) = jsonio::next_prompt() {
            if line.trim().is_empty() {
                continue;
            }
            jsonio::clear_cancel();
            run_json_turn(&mut agent, &line).await;
        }
    } else if let Some(p) = prompt {
        agent.run_turn(&p).await?;
    } else {
        screen::set_interactive(true);
        ui::help();
        screen::line("");
        let mut editor = input::Editor::new();
        let hint = "⏎ send   ⌥⏎ newline   /help   ctrl+c clear · quit";
        loop {
            let line = match editor.read(hint)? {
                input::Input::Line(l) => l,
                input::Input::Interrupt | input::Input::Eof => break,
            };
            ui::user_echo(&line);
            match line.as_str() {
                "/quit" | "/exit" | "/q" => break,
                "/help" | "/?" => ui::help(),
                "/clear" => {
                    agent.reset();
                    ui::info("conversation cleared");
                }
                "/stop" => {
                    let msg = agent.ctx().pm.lock().await.stop().await;
                    ui::info(&msg);
                }
                "/logs" => {
                    let pm = agent.ctx().pm.lock().await;
                    screen::line(&pm.tail(60));
                }
                _ => agent.run_turn(&line).await?,
            }
        }
    }

    screen::take_down();
    let mut pm = pm.lock().await;
    if pm.is_running() {
        let msg = pm.stop().await;
        ui::info(&msg);
    }
    Ok(())
}

/// One turn in JSON mode, bracketed by a turn_end the editor waits on.
async fn run_json_turn(agent: &mut agent::Agent, prompt: &str) {
    match agent.run_turn(prompt).await {
        Ok(()) => jsonio::emit("turn_end", serde_json::json!({"ok": true})),
        Err(e) => {
            jsonio::emit(
                "error",
                serde_json::json!({"code": "turn_failed", "message": format!("{e:#}")}),
            );
            jsonio::emit("turn_end", serde_json::json!({"ok": false}));
        }
    }
}
