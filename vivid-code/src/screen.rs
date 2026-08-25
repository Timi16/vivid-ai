//! Terminal screen with a sticky footer.
//!
//! Everything Vivid Code prints scrolls upward as normal terminal output while
//! the prompt box stays pinned at the bottom — during generation too. The
//! region at the bottom (an unfinished output line plus the box) is erased and
//! redrawn on every change; completed lines are released into scrollback and
//! never touched again.
//!
//! All repositioning is relative to the block last drawn, so a scroll cannot
//! desync it, and nothing is ever read back from the terminal (querying the
//! cursor eats the user's keystrokes).
use crossterm::terminal::{Clear, ClearType};
use crossterm::{cursor, queue, style::Print, terminal};
use std::io::{stdout, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;

const DIM: &str = "\x1b[2m";
const MAGENTA: &str = "\x1b[35m";
const RESET: &str = "\x1b[0m";
const SPINNER: [&str; 8] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧"];

pub enum Footer {
    /// No sticky box (one-shot mode): output goes straight through.
    Off,
    /// The agent is working; the box stays visible but is not editable.
    Busy { label: String, since: Instant, frame: usize },
    /// Waiting for the user.
    Edit { buf: String, pos: usize, hint: String },
    /// Waiting for a yes/no keypress.
    Ask { question: String },
}

struct State {
    footer: Footer,
    /// Height of the block currently drawn at the bottom.
    region: u16,
    /// Row within that block where the cursor is parked.
    park: u16,
    /// Output written since the last newline; lives in the region until complete.
    partial: String,
}

static S: Mutex<State> = Mutex::new(State {
    footer: Footer::Off,
    region: 0,
    park: 0,
    partial: String::new(),
});
static SPINNING: AtomicBool = AtomicBool::new(false);
/// One-shot runs print straight through; only an interactive session keeps a
/// sticky box at the bottom.
static INTERACTIVE: AtomicBool = AtomicBool::new(false);

pub fn set_interactive(on: bool) {
    INTERACTIVE.store(on, Ordering::Relaxed);
}

pub fn width() -> u16 {
    let cols = match terminal::size() {
        Ok((c, _)) if c >= 20 => c,
        _ => 80,
    };
    cols.saturating_sub(1).max(24)
}

/// Append output. Complete lines are released to scrollback.
pub fn write(text: &str) {
    let mut st = S.lock().unwrap();
    if matches!(st.footer, Footer::Off) && st.region == 0 {
        // No sticky box: nothing below to protect, so write straight through.
        let mut out = stdout();
        let _ = out.write_all(text.as_bytes());
        let _ = out.flush();
        return;
    }
    st.partial.push_str(text);
    let _ = render(&mut st);
}

/// Replace the unfinished output line (used by the Markdown renderer, which
/// restyles the tail as more of it arrives).
pub fn set_partial(text: &str) {
    let mut st = S.lock().unwrap();
    if matches!(st.footer, Footer::Off) {
        return; // nothing below to redraw against
    }
    st.partial.clear();
    st.partial.push_str(text);
    let _ = render(&mut st);
}

/// The live preview URL, shown under the box so it is always one glance away.
static PREVIEW: Mutex<String> = Mutex::new(String::new());

pub fn set_preview(url: Option<String>) {
    {
        let mut p = PREVIEW.lock().unwrap();
        p.clear();
        if let Some(u) = url {
            p.push_str(&u);
        }
    }
    let mut st = S.lock().unwrap();
    let _ = render(&mut st);
}

pub fn is_interactive() -> bool {
    INTERACTIVE.load(Ordering::Relaxed)
}

pub fn line(text: &str) {
    write(&format!("{text}\n"));
}

pub fn set_footer(f: Footer) {
    let mut st = S.lock().unwrap();
    let spin = matches!(f, Footer::Busy { .. });
    st.footer = f;
    let _ = render(&mut st);
    drop(st);
    SPINNING.store(spin, Ordering::Relaxed);
    if spin {
        start_spinner();
    }
}

pub fn busy(label: &str) {
    if !INTERACTIVE.load(Ordering::Relaxed) {
        return;
    }
    // Keep the running clock across relabels within one turn.
    let since = {
        let st = S.lock().unwrap();
        match &st.footer {
            Footer::Busy { since, .. } => *since,
            _ => Instant::now(),
        }
    };
    set_footer(Footer::Busy { label: label.to_string(), since, frame: 0 });
}

pub fn ask(question: &str) {
    set_footer(Footer::Ask { question: question.to_string() });
}

pub fn edit(buf: &str, pos: usize, hint: &str) {
    set_footer(Footer::Edit { buf: buf.to_string(), pos, hint: hint.to_string() });
}

/// Erase the region and leave the cursor where output continues.
pub fn take_down() {
    let mut st = S.lock().unwrap();
    SPINNING.store(false, Ordering::Relaxed);
    st.footer = Footer::Off;
    let _ = render(&mut st);
}

fn start_spinner() {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| loop {
        std::thread::sleep(std::time::Duration::from_millis(110));
        if !SPINNING.load(Ordering::Relaxed) {
            continue;
        }
        let mut st = S.lock().unwrap();
        if let Footer::Busy { frame, .. } = &mut st.footer {
            *frame = frame.wrapping_add(1);
            let _ = render(&mut st);
        }
    });
}

fn render(st: &mut State) -> std::io::Result<()> {
    let mut out = stdout();

    // Walk back to the top of the block drawn last time, then wipe it.
    if st.region > 0 {
        let down = st.region.saturating_sub(1).saturating_sub(st.park);
        queue!(out, cursor::MoveToColumn(0))?;
        if down > 0 {
            queue!(out, cursor::MoveDown(down))?;
        }
        if st.region > 1 {
            queue!(out, cursor::MoveUp(st.region - 1))?;
        }
    }
    queue!(out, cursor::MoveToColumn(0), Clear(ClearType::FromCursorDown))?;

    // Release finished lines into scrollback.
    while let Some(i) = st.partial.find('\n') {
        let done: String = st.partial.drain(..=i).collect();
        queue!(out, Print(format!("{}\r\n", done.trim_end_matches('\n'))))?;
    }

    if matches!(st.footer, Footer::Off) {
        // Sticky box just came down: flush whatever is left, then stay out of
        // the way — later writes go straight through.
        let rest = std::mem::take(&mut st.partial);
        queue!(out, Print(rest))?;
        out.flush()?;
        st.region = 0;
        st.park = 0;
        return Ok(());
    }

    // The region: the unfinished output line (wrapped to real rows), a blank
    // gap, then the box. Wrapping it ourselves is what keeps the height exact —
    // letting the terminal soft-wrap it made the region taller than we thought
    // and left stale copies behind.
    let cols = match terminal::size() {
        Ok((c, _)) if c >= 20 => c as usize,
        _ => 80,
    };
    let prows = wrap_ansi(&st.partial, cols);
    for r in &prows {
        queue!(out, Print(format!("{r}\r\n")))?;
    }
    queue!(out, Print("\r\n"))?;
    let mut rows = prows.len() as u16 + 1;

    let w = width();
    let inner = w.saturating_sub(2) as usize;
    let (body, hint, caret): (Vec<String>, String, Option<(u16, u16)>) = match &st.footer {
        Footer::Busy { label, since, frame } => {
            let sp = SPINNER[frame % SPINNER.len()];
            let secs = since.elapsed().as_secs();
            let text = if secs >= 2 { format!("{label} ({secs}s)") } else { label.clone() };
            (vec![format!("{MAGENTA}{sp}{RESET} {DIM}{text}{RESET}|{}", 2 + text.chars().count())],
             "ctrl+c interrupt".to_string(), None)
        }
        Footer::Edit { buf, pos, hint } => {
            let (lines, crow, ccol) = layout(buf, *pos, inner.saturating_sub(3).max(1));
            let mut rendered = Vec::new();
            for (i, l) in lines.iter().enumerate() {
                let marker = if i == 0 { format!("{MAGENTA}›{RESET} ") } else { "  ".to_string() };
                if buf.is_empty() && i == 0 {
                    let ph: String = "describe what to build…".chars().take(inner.saturating_sub(3)).collect();
                    let n = ph.chars().count();
                    rendered.push(format!("{marker}{DIM}{ph}{RESET}|{}", 2 + n));
                } else {
                    let n = l.chars().count();
                    rendered.push(format!("{marker}{l}|{}", 2 + n));
                }
            }
            (rendered, hint.clone(), Some((crow, ccol)))
        }
        Footer::Ask { question } => (
            vec![format!("{MAGENTA}?{RESET} {question}|{}", 2 + question.chars().count())],
            "y run it   n skip   esc cancel".to_string(),
            None,
        ),
        Footer::Off => unreachable!(),
    };

    let box_top = rows; // row index of the top border within the block
    queue!(out, Print(format!("{DIM}╭{}╮{RESET}\r\n", "─".repeat(inner))))?;
    rows += 1;
    for row in &body {
        let (text, vis) = row.rsplit_once('|').unwrap_or((row.as_str(), "0"));
        let vis: usize = vis.parse().unwrap_or(0);
        let pad = inner.saturating_sub(1 + vis);
        queue!(out, Print(format!("{DIM}│{RESET} {text}{}{DIM}│{RESET}\r\n", " ".repeat(pad))))?;
        rows += 1;
    }
    queue!(out, Print(format!("{DIM}╰{}╯{RESET}\r\n", "─".repeat(inner))))?;
    rows += 1;
    let preview = PREVIEW.lock().unwrap().clone();
    if preview.is_empty() {
        queue!(out, Print(format!("{DIM}  {hint}{RESET}")))?;
    } else {
        queue!(out, Print(format!("{DIM}  {hint}   {RESET}{MAGENTA}◉{RESET} {preview}")))?;
    }
    rows += 1;

    // Park the cursor: in the text when editing, else at the end of the block.
    let park = match caret {
        Some((crow, _)) => box_top + 1 + crow,
        None => rows - 1,
    };
    let up = rows.saturating_sub(1).saturating_sub(park);
    queue!(out, cursor::MoveToColumn(0))?;
    if up > 0 {
        queue!(out, cursor::MoveUp(up))?;
    }
    if let Some((_, ccol)) = caret {
        queue!(out, cursor::MoveToColumn(4 + ccol))?;
    }
    out.flush()?;

    st.region = rows;
    st.park = park;
    Ok(())
}

/// Wrap text that may contain ANSI escapes, counting only visible characters.
/// Escapes are carried through and never counted toward the width.
fn wrap_ansi(s: &str, width: usize) -> Vec<String> {
    let width = width.max(1);
    let mut rows = Vec::new();
    let mut cur = String::new();
    let mut vis = 0usize;
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            cur.push(c);
            for e in chars.by_ref() {
                cur.push(e);
                if e.is_ascii_alphabetic() {
                    break;
                }
            }
            continue;
        }
        if vis == width {
            rows.push(std::mem::take(&mut cur));
            vis = 0;
        }
        cur.push(c);
        vis += 1;
    }
    rows.push(cur);
    rows
}

/// Wrap `buf` to `width` and locate the caret. Rows are byte ranges into the
/// buffer, so the caret column is exact even across wraps.
fn layout(buf: &str, pos: usize, width: usize) -> (Vec<String>, u16, u16) {
    let mut lines: Vec<String> = Vec::new();
    let (mut crow, mut ccol) = (0u16, 0u16);
    let mut base = 0usize;
    for (li, logical) in buf.split('\n').enumerate() {
        if li > 0 {
            base += 1; // the '\n'
        }
        for (s0, e0) in wrap_ranges(logical, width) {
            let (start, end) = (base + s0, base + e0);
            if pos >= start && pos <= end {
                crow = lines.len() as u16;
                ccol = buf[start..pos].chars().count() as u16;
            }
            lines.push(logical[s0..e0].to_string());
        }
        base += logical.len();
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    (lines, crow, ccol)
}

/// Byte ranges of the visual rows `s` wraps into. A break on a space consumes
/// that space; every other byte survives, so caret offsets stay exact.
fn wrap_ranges(s: &str, width: usize) -> Vec<(usize, usize)> {
    if s.is_empty() {
        return vec![(0, 0)];
    }
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    let mut rows = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        let start = chars[i].0;
        let stop = (i + width).min(chars.len());
        if stop < chars.len() {
            if let Some(k) = (i..stop).rev().find(|&k| chars[k].1 == ' ') {
                if k > i {
                    rows.push((start, chars[k].0));
                    i = k + 1;
                    continue;
                }
            }
        }
        let end = if stop < chars.len() { chars[stop].0 } else { s.len() };
        rows.push((start, end));
        i = stop;
    }
    rows
}
