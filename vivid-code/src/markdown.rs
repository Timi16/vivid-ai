//! Just enough Markdown for a terminal: the model writes `**bold**`, `###`
//! headings, bullets and `code`, and a chat window should show the styling
//! rather than the punctuation.
use owo_colors::OwoColorize;

/// Streaming renderer: feed it tokens, it emits finished lines already styled
/// and keeps the unfinished tail so the caller can show it live.
pub struct Md {
    line: String,
    in_code: bool,
}

impl Md {
    pub fn new() -> Self {
        Self { line: String::new(), in_code: false }
    }

    /// Feed raw text. Returns (finished styled lines, styled unfinished tail).
    pub fn push(&mut self, text: &str) -> (Vec<String>, String) {
        self.line.push_str(text);
        let mut done = Vec::new();
        while let Some(i) = self.line.find('\n') {
            let raw: String = self.line.drain(..=i).collect();
            done.push(self.block(raw.trim_end_matches('\n')));
        }
        (done, self.tail())
    }

    /// Style the unfinished line, leaving a half-typed `**` alone.
    fn tail(&self) -> String {
        if self.in_code {
            return format!("  {}", self.line.cyan());
        }
        inline(&self.line)
    }

    /// Flush whatever is left when the reply ends.
    pub fn finish(&mut self) -> Option<String> {
        if self.line.is_empty() {
            return None;
        }
        let raw = std::mem::take(&mut self.line);
        Some(self.block(&raw))
    }

    fn block(&mut self, line: &str) -> String {
        let trimmed = line.trim_start();

        // fenced code block
        if trimmed.starts_with("```") {
            self.in_code = !self.in_code;
            let lang = trimmed.trim_start_matches('`').trim();
            return if self.in_code && !lang.is_empty() {
                format!("  {}", lang.dimmed())
            } else {
                String::new()
            };
        }
        if self.in_code {
            return format!("  {}", line.cyan());
        }

        // horizontal rule
        if trimmed.len() >= 3 && trimmed.chars().all(|c| c == '-' || c == '*' || c == '_') {
            return "─".repeat(40).dimmed().to_string();
        }

        // heading
        if trimmed.starts_with('#') {
            let level = trimmed.chars().take_while(|&c| c == '#').count();
            let text = trimmed[level..].trim();
            let text = strip_marks(text);
            return if level <= 2 {
                format!("{}", text.magenta().bold())
            } else {
                format!("{}", text.bold())
            };
        }

        let indent = &line[..line.len() - trimmed.len()];

        // bullet
        for m in ["- ", "* ", "+ "] {
            if let Some(rest) = trimmed.strip_prefix(m) {
                return format!("{indent}{} {}", "•".magenta(), inline(rest));
            }
        }
        // numbered list: keep the number, style the rest
        if let Some(dot) = trimmed.find(". ") {
            if dot > 0 && dot <= 3 && trimmed[..dot].chars().all(|c| c.is_ascii_digit()) {
                return format!("{indent}{} {}", trimmed[..=dot].to_string().magenta(), inline(&trimmed[dot + 2..]));
            }
        }
        // blockquote
        if let Some(rest) = trimmed.strip_prefix("> ") {
            return format!("{indent}{} {}", "│".dimmed(), inline(rest).dimmed());
        }

        format!("{indent}{}", inline(trimmed))
    }
}

/// `**bold**`, `` `code` `` and `*italic*` → terminal styling.
pub fn inline(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        // `code`
        if chars[i] == '`' {
            if let Some(end) = find(&chars, i + 1, &['`']) {
                let inner: String = chars[i + 1..end].iter().collect();
                out.push_str(&inner.cyan().to_string());
                i = end + 1;
                continue;
            }
        }
        // **bold**
        if chars[i] == '*' && chars.get(i + 1) == Some(&'*') {
            if let Some(end) = find_pair(&chars, i + 2) {
                let inner: String = chars[i + 2..end].iter().collect();
                out.push_str(&inline(&inner).bold().to_string());
                i = end + 2;
                continue;
            }
        }
        // *italic* — only when it clearly delimits a word, so `a*b` survives
        if chars[i] == '*'
            && chars.get(i + 1).map_or(false, |c| !c.is_whitespace())
            && (i == 0 || chars[i - 1].is_whitespace() || chars[i - 1] == '(')
        {
            if let Some(end) = find(&chars, i + 1, &['*']) {
                let inner: String = chars[i + 1..end].iter().collect();
                out.push_str(&inner.italic().to_string());
                i = end + 1;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn find(chars: &[char], from: usize, want: &[char]) -> Option<usize> {
    (from..chars.len()).find(|&j| want.contains(&chars[j]) && j > from)
}

fn find_pair(chars: &[char], from: usize) -> Option<usize> {
    (from..chars.len().saturating_sub(1))
        .find(|&j| chars[j] == '*' && chars[j + 1] == '*' && j > from)
}

/// Drop leftover markers from text we style ourselves (headings).
fn strip_marks(s: &str) -> String {
    s.replace("**", "").replace('`', "")
}
