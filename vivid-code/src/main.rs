mod agent;
mod browser;
mod config;
mod input;
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
    /// Open a URL in a headless browser and report JS errors, then exit.
    /// No model involved: `vivid --check http://localhost:3000`
    #[arg(long, value_name = "URL")]
    check: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
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
                if let Some(f) = &r.framing {
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

    let cfg = config::Config::load(args.url.clone(), args.model.clone(), !args.no_stream);
    // Ask the engine what it is serving and how big its window is, so moving to
    // a roomier pod widens the budget without editing anything here.
    let (model, engine_ctx) = match cfg.model.clone() {
        Some(m) => (m, None),
        None => config::discover(&cfg.url).await?,
    };
    let cfg = cfg.with_engine_context(engine_ctx);
    let llm = llm::Client::new(&cfg.url, &model, cfg.stream, cfg.max_reply_tokens)?;
    let pm = Arc::new(Mutex::new(process::ProcessManager::default()));
    let ctx = tools::Ctx { root: root.clone(), pm: pm.clone(), http: reqwest::Client::new() };
    let system = prompt::build(&root);
    let mut agent = agent::Agent::new(llm, ctx, system, args.yolo, args.max_iter, cfg.context_budget);

    ui::banner(&root.display().to_string());
    if std::env::var("VIVID_DEBUG").is_ok() {
        ui::info(&format!("engine {} · {}", cfg.url, model));
    }

    // `vivid code` is the product's name, not a task — treat it as "no prompt".
    let prompt = args.prompt.filter(|p| !p.trim().eq_ignore_ascii_case("code"));

    if let Some(p) = prompt {
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
