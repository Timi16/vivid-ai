//! Fills the system prompt with the facts of this run: cwd, OS, date, repo map.
use ignore::WalkBuilder;
use std::path::Path;

const SYSTEM: &str = include_str!("../prompts/system.md");
const MAX_ENTRIES: usize = 150;
const SKIP: &[&str] = &["node_modules", ".git", "target", ".next", "dist", "build", ".venv", "__pycache__", ".expo"];

pub fn build(root: &Path) -> String {
    SYSTEM
        .replace("{{CWD}}", &root.display().to_string())
        .replace("{{OS}}", &format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH))
        .replace("{{DATE}}", &chrono::Local::now().format("%A %d %B %Y").to_string())
        .replace("{{SHELL}}", &std::env::var("SHELL").unwrap_or_else(|_| "sh".into()))
        .replace("{{GIT}}", &git_line(root))
        .replace("{{REPO_MAP}}", &repo_map(root))
}

/// Branch and working-tree state, when this is a git repository.
fn git_line(root: &Path) -> String {
    use std::process::Command;
    let run = |args: &[&str]| {
        Command::new("git")
            .args(args)
            .current_dir(root)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    };
    let Some(branch) = run(&["rev-parse", "--abbrev-ref", "HEAD"]) else {
        return "not a git repository".into();
    };
    let dirty = run(&["status", "--porcelain"]).unwrap_or_default();
    let n = dirty.lines().filter(|l| !l.trim().is_empty()).count();
    if n == 0 {
        format!("{branch} (clean)")
    } else {
        format!("{branch} ({n} uncommitted file{})", if n == 1 { "" } else { "s" })
    }
}

pub fn repo_map(root: &Path) -> String {
    let mut entries: Vec<String> = Vec::new();
    let walker = WalkBuilder::new(root)
        .max_depth(Some(3))
        .hidden(true)
        .filter_entry(|e| !SKIP.contains(&e.file_name().to_string_lossy().as_ref()))
        .build();
    let mut total = 0usize;
    for entry in walker.flatten() {
        let path = entry.path();
        if path == root {
            continue;
        }
        total += 1;
        if entries.len() >= MAX_ENTRIES {
            continue;
        }
        let rel = path.strip_prefix(root).unwrap_or(path).display().to_string();
        let is_dir = entry.file_type().map_or(false, |t| t.is_dir());
        entries.push(if is_dir { format!("{rel}/") } else { rel });
    }
    entries.sort();

    let mut out = String::new();
    if entries.is_empty() {
        out.push_str("(empty directory — you are starting from scratch)\n");
    } else {
        for e in &entries {
            out.push_str("- ");
            out.push_str(e);
            out.push('\n');
        }
        if total > MAX_ENTRIES {
            out.push_str(&format!("... and {} more entries (use list_files to explore)\n", total - MAX_ENTRIES));
        }
    }
    if let Ok(pkg) = std::fs::read_to_string(root.join("package.json")) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&pkg) {
            let name = v["name"].as_str().unwrap_or("?");
            let scripts = v["scripts"]
                .as_object()
                .map(|m| m.keys().cloned().collect::<Vec<_>>().join(", "))
                .unwrap_or_default();
            out.push_str(&format!("\npackage.json: name={name}; scripts: {scripts}\n"));
        }
    }
    let pm = if root.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if root.join("yarn.lock").exists() {
        "yarn"
    } else if root.join("package-lock.json").exists() {
        "npm"
    } else {
        ""
    };
    if !pm.is_empty() {
        out.push_str(&format!("Package manager in use: {pm}\n"));
    }
    out
}
