use super::{arg_str, arg_u64, resolve, Ctx};
use crate::ui;
use anyhow::{anyhow, Context, Result};
use ignore::WalkBuilder;
use regex::Regex;
use serde_json::Value;

const SKIP: &[&str] = &["node_modules", ".git", "target", ".next", "dist", "build", ".venv", "__pycache__", ".expo"];
const MAX_READ_CHARS: usize = 40_000;

pub fn list_files(ctx: &Ctx, args: &Value) -> Result<String> {
    let path = resolve(&ctx.root, arg_str(args, "path").unwrap_or("."))?;
    let depth = arg_u64(args, "depth").unwrap_or(3) as usize;
    if !path.exists() {
        return Err(anyhow!("`{}` does not exist", path.display()));
    }
    let mut out = Vec::new();
    let mut total = 0;
    for entry in WalkBuilder::new(&path)
        .max_depth(Some(depth))
        .hidden(true)
        .filter_entry(|e| !SKIP.contains(&e.file_name().to_string_lossy().as_ref()))
        .build()
        .flatten()
    {
        if entry.path() == path {
            continue;
        }
        total += 1;
        if out.len() >= 200 {
            continue;
        }
        let rel = entry.path().strip_prefix(&ctx.root).unwrap_or(entry.path()).display().to_string();
        let is_dir = entry.file_type().map_or(false, |t| t.is_dir());
        out.push(if is_dir { format!("{rel}/") } else { rel });
    }
    out.sort();
    if out.is_empty() {
        return Ok("(empty)".into());
    }
    let mut s = out.join("\n");
    if total > 200 {
        s.push_str(&format!("\n… {} more entries not shown", total - 200));
    }
    Ok(s)
}

pub fn read_file(ctx: &Ctx, args: &Value) -> Result<String> {
    let rel = arg_str(args, "path").ok_or_else(|| anyhow!("path is required"))?;
    let path = resolve(&ctx.root, rel)?;
    let text = std::fs::read_to_string(&path)
        .with_context(|| format!("could not read `{rel}` (missing or not a text file)"))?;
    let offset = arg_u64(args, "offset").unwrap_or(1).max(1) as usize;
    let limit = arg_u64(args, "limit").unwrap_or(300).clamp(1, 1000) as usize;
    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return Ok("(empty file)".into());
    }
    if offset > lines.len() {
        return Err(anyhow!("offset {offset} is past the end ({} lines)", lines.len()));
    }
    let mut out = String::new();
    let mut chars = 0;
    let mut end = offset - 1;
    for (i, line) in lines.iter().enumerate().skip(offset - 1).take(limit) {
        let row = format!("{:>5}| {}\n", i + 1, line);
        chars += row.len();
        if chars > MAX_READ_CHARS {
            break;
        }
        out.push_str(&row);
        end = i + 1;
    }
    if end < lines.len() {
        out.push_str(&format!("… {} more lines (total {}). Use offset={} to continue.\n", lines.len() - end, lines.len(), end + 1));
    }
    Ok(out)
}

pub fn search_files(ctx: &Ctx, args: &Value) -> Result<String> {
    let pattern = arg_str(args, "pattern").ok_or_else(|| anyhow!("pattern is required"))?;
    let re = Regex::new(pattern).with_context(|| format!("invalid regex `{pattern}`"))?;
    let path = resolve(&ctx.root, arg_str(args, "path").unwrap_or("."))?;
    let mut hits = Vec::new();
    let mut total = 0;
    for entry in WalkBuilder::new(&path)
        .hidden(true)
        .filter_entry(|e| !SKIP.contains(&e.file_name().to_string_lossy().as_ref()))
        .build()
        .flatten()
    {
        if !entry.file_type().map_or(false, |t| t.is_file()) {
            continue;
        }
        if entry.metadata().map(|m| m.len() > 1_000_000).unwrap_or(true) {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(entry.path()) else { continue };
        let rel = entry.path().strip_prefix(&ctx.root).unwrap_or(entry.path()).display().to_string();
        for (i, line) in text.lines().enumerate() {
            if re.is_match(line) {
                total += 1;
                if hits.len() < 100 {
                    let l: String = line.trim().chars().take(200).collect();
                    hits.push(format!("{rel}:{}: {l}", i + 1));
                }
            }
        }
    }
    if hits.is_empty() {
        return Ok("no matches".into());
    }
    let mut s = hits.join("\n");
    if total > 100 {
        s.push_str(&format!("\n… {} more matches", total - 100));
    }
    Ok(s)
}

pub fn write_file(ctx: &Ctx, args: &Value) -> Result<String> {
    let rel = arg_str(args, "path").ok_or_else(|| anyhow!("path is required"))?;
    let content = arg_str(args, "content").ok_or_else(|| anyhow!("content is required"))?;
    let path = resolve(&ctx.root, rel)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let existed = path.exists();
    std::fs::write(&path, content).with_context(|| format!("could not write `{rel}`"))?;
    Ok(format!(
        "{} {rel} ({} bytes, {} lines)",
        if existed { "Overwrote" } else { "Created" },
        content.len(),
        content.lines().count()
    ))
}

pub fn edit_file(ctx: &Ctx, args: &Value) -> Result<String> {
    let rel = arg_str(args, "path").ok_or_else(|| anyhow!("path is required"))?;
    let old = arg_str(args, "old_string").ok_or_else(|| anyhow!("old_string is required"))?;
    let new = arg_str(args, "new_string").ok_or_else(|| anyhow!("new_string is required"))?;
    let path = resolve(&ctx.root, rel)?;
    let text = std::fs::read_to_string(&path).with_context(|| format!("could not read `{rel}`"))?;
    let count = text.matches(old).count();
    if count == 0 {
        return Err(anyhow!("old_string was not found in {rel}. Read the file and copy the exact text."));
    }
    if count > 1 {
        return Err(anyhow!("old_string appears {count} times in {rel}; include more surrounding lines so it is unique."));
    }
    let updated = text.replacen(old, new, 1);
    ui::diff(rel, old, new);
    std::fs::write(&path, &updated)?;
    Ok(format!("Edited {rel} ({} lines now)", updated.lines().count()))
}
