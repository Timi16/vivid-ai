// A markdown-it plugin for TeX math: `$...$` inline and `$$...$$` display,
// the same delimiters the web renders through remark-math + KaTeX. It only
// tokenises; the renderer decides how to draw the formula. Pure, so the
// tokens are unit tested.

import type MarkdownIt from "markdown-it";
import type StateBlock from "markdown-it/lib/rules_block/state_block";
import type StateInline from "markdown-it/lib/rules_inline/state_inline";

// An opening `$` must not be followed by whitespace, and a closing `$` must
// not be preceded by it or followed by a digit, so "$5 and $10" stays money.
function isValidOpen(src: string, pos: number): boolean {
  const next = src.charCodeAt(pos + 1);
  return !Number.isNaN(next) && !/\s/.test(src[pos + 1]);
}

function isValidClose(src: string, pos: number): boolean {
  const prev = src[pos - 1];
  const next = src[pos + 1];
  if (/\s/.test(prev)) return false;
  return next === undefined || !/\d/.test(next);
}

function mathInline(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x24 /* $ */) return false;
  // `$$` inline is display math on one line.
  const display = src.charCodeAt(pos + 1) === 0x24;
  const open = display ? "$$" : "$";
  const start = pos + open.length;
  if (!display && !isValidOpen(src, pos)) return false;

  let scan = start;
  let end = -1;
  while (scan < state.posMax) {
    const found = src.indexOf(open, scan);
    if (found < 0 || found >= state.posMax) break;
    if (src[found - 1] === "\\") {
      scan = found + 1;
      continue;
    }
    if (display || isValidClose(src, found)) {
      end = found;
      break;
    }
    scan = found + 1;
  }
  if (end < 0 || end === start) return false;

  if (!silent) {
    const token = state.push(display ? "math_block" : "math_inline", "math", 0);
    token.content = src.slice(start, end).trim();
    token.markup = open;
  }
  state.pos = end + open.length;
  return true;
}

function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (pos + 2 > max) return false;
  if (state.src.slice(pos, pos + 2) !== "$$") return false;
  pos += 2;
  let firstLine = state.src.slice(pos, max);

  if (silent) return true;

  // `$$ x $$` on one line.
  let lastLine = "";
  let found = false;
  let nextLine = startLine;
  if (firstLine.trim().endsWith("$$")) {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }

  while (!found) {
    nextLine += 1;
    if (nextLine >= endLine) break;
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos < max && state.tShift[nextLine] < state.blkIndent) break;
    const line = state.src.slice(pos, max);
    if (line.trim().endsWith("$$")) {
      lastLine = line.trim().slice(0, -2);
      found = true;
    }
  }
  if (!found) return false;

  state.line = nextLine + 1;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  const body = state.getLines(startLine + 1, nextLine, state.tShift[startLine], true);
  token.content = [firstLine, body, lastLine]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
  token.markup = "$$";
  token.map = [startLine, state.line];
  return true;
}

export function markdownMath(md: MarkdownIt) {
  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.block.ruler.after("blockquote", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
}
