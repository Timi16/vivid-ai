//! Key handling for the prompt box. The box itself is drawn by `screen`, which
//! keeps it pinned at the bottom while output scrolls above.
use crate::screen;
use anyhow::Result;
use crossterm::event::{
    self, DisableBracketedPaste, EnableBracketedPaste, Event, KeyCode, KeyEvent, KeyEventKind,
    KeyModifiers,
};
use crossterm::execute;
use crossterm::terminal::{disable_raw_mode, enable_raw_mode};
use std::io::stdout;

pub enum Input {
    Line(String),
    Interrupt,
    Eof,
}

pub struct Editor {
    history: Vec<String>,
    hist_pos: Option<usize>,
}

impl Editor {
    pub fn new() -> Self {
        Self { history: Vec::new(), hist_pos: None }
    }

    pub fn read(&mut self, hint: &str) -> Result<Input> {
        enable_raw_mode()?;
        let _ = execute!(stdout(), EnableBracketedPaste);
        let out = self.run(hint);
        let _ = execute!(stdout(), DisableBracketedPaste);
        disable_raw_mode()?;
        Ok(out.unwrap_or(Input::Eof))
    }

    fn run(&mut self, hint: &str) -> Result<Input> {
        let mut buf = String::new();
        let mut pos = 0usize; // byte offset of the caret
        self.hist_pos = None;
        screen::edit(&buf, pos, hint);

        loop {
            let ev = match event::read() {
                Ok(e) => e,
                Err(_) => return Ok(Input::Eof),
            };
            match ev {
                Event::Paste(text) => {
                    let text = text.replace('\r', "\n");
                    buf.insert_str(pos, &text);
                    pos += text.len();
                }
                Event::Resize(_, _) => {}
                Event::Key(KeyEvent { kind: KeyEventKind::Release, .. }) => continue,
                Event::Key(KeyEvent { code, modifiers, .. }) => {
                    let ctrl = modifiers.contains(KeyModifiers::CONTROL);
                    let alt = modifiers.contains(KeyModifiers::ALT);
                    match code {
                        // ctrl+c clears a draft first; only an empty box exits.
                        KeyCode::Char('c') if ctrl => {
                            if buf.is_empty() {
                                return Ok(Input::Interrupt);
                            }
                            buf.clear();
                            pos = 0;
                            self.hist_pos = None;
                        }
                        KeyCode::Char('d') if ctrl => {
                            if buf.is_empty() {
                                return Ok(Input::Eof);
                            }
                        }
                        KeyCode::Char('u') if ctrl => {
                            buf.clear();
                            pos = 0;
                        }
                        KeyCode::Char('a') if ctrl => pos = line_start(&buf, pos),
                        KeyCode::Char('e') if ctrl => pos = line_end(&buf, pos),
                        KeyCode::Char('j') if ctrl => {
                            buf.insert(pos, '\n');
                            pos += 1;
                        }
                        KeyCode::Enter if alt || ctrl => {
                            buf.insert(pos, '\n');
                            pos += 1;
                        }
                        KeyCode::Enter => {
                            let text = buf.trim().to_string();
                            if text.is_empty() {
                                buf.clear();
                                pos = 0;
                            } else {
                                self.history.push(text.clone());
                                return Ok(Input::Line(text));
                            }
                        }
                        KeyCode::Char(c) => {
                            buf.insert(pos, c);
                            pos += c.len_utf8();
                        }
                        KeyCode::Backspace => {
                            if pos > 0 {
                                let prev = prev_boundary(&buf, pos);
                                buf.replace_range(prev..pos, "");
                                pos = prev;
                            }
                        }
                        KeyCode::Delete => {
                            if pos < buf.len() {
                                let next = next_boundary(&buf, pos);
                                buf.replace_range(pos..next, "");
                            }
                        }
                        KeyCode::Left => {
                            if pos > 0 {
                                pos = prev_boundary(&buf, pos);
                            }
                        }
                        KeyCode::Right => {
                            if pos < buf.len() {
                                pos = next_boundary(&buf, pos);
                            }
                        }
                        KeyCode::Home => pos = line_start(&buf, pos),
                        KeyCode::End => pos = line_end(&buf, pos),
                        KeyCode::Up => {
                            if !buf.contains('\n') && !self.history.is_empty() {
                                let i = match self.hist_pos {
                                    None => self.history.len() - 1,
                                    Some(0) => 0,
                                    Some(i) => i - 1,
                                };
                                self.hist_pos = Some(i);
                                buf = self.history[i].clone();
                                pos = buf.len();
                            }
                        }
                        KeyCode::Down => {
                            if let Some(i) = self.hist_pos {
                                if i + 1 < self.history.len() {
                                    self.hist_pos = Some(i + 1);
                                    buf = self.history[i + 1].clone();
                                } else {
                                    self.hist_pos = None;
                                    buf.clear();
                                }
                                pos = buf.len();
                            }
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
            screen::edit(&buf, pos, hint);
        }
    }
}

fn prev_boundary(s: &str, pos: usize) -> usize {
    let mut i = pos - 1;
    while !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn next_boundary(s: &str, pos: usize) -> usize {
    let mut i = pos + 1;
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

fn line_start(s: &str, pos: usize) -> usize {
    s[..pos].rfind('\n').map(|i| i + 1).unwrap_or(0)
}

fn line_end(s: &str, pos: usize) -> usize {
    s[pos..].find('\n').map(|i| pos + i).unwrap_or(s.len())
}
