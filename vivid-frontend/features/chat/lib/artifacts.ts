// An artifact is something the assistant made that deserves its own surface
// beside the chat: a code block, a website, or a generated file.
export type Artifact =
  | { kind: "code"; title: string; language: string; content: string }
  | { kind: "file"; title: string; url: string; mime: string };

// Languages whose code blocks can be shown as a live preview.
export function isPreviewable(language: string): boolean {
  return ["html", "htm", "svg"].includes(language.toLowerCase());
}

export function fileExtension(language: string): string {
  const map: Record<string, string> = {
    python: "py",
    javascript: "js",
    typescript: "ts",
    tsx: "tsx",
    jsx: "jsx",
    html: "html",
    htm: "html",
    css: "css",
    json: "json",
    bash: "sh",
    shell: "sh",
    sql: "sql",
    markdown: "md",
    yaml: "yml",
  };
  return map[language.toLowerCase()] ?? "txt";
}

// A website the model built inside a reply: one self-contained HTML document
// in a single ```html fence (the contract in the backend prompt).
export interface HtmlArtifact {
  // Markdown before the fence: the model's one-line intro.
  before: string;
  html: string;
  // False while the reply is still streaming and the closing fence has not
  // arrived yet. Drives the "generating" state.
  complete: boolean;
  title: string;
  // Markdown after the closing fence; empty until it exists.
  after: string;
}

export const DEFAULT_SITE_TITLE = "Website";

const FENCE_OPEN = /```([\w-]*)[^\n]*\n/g;
const DOC_START = /^\s*(<!doctype\s+html|<html)/i;
const TITLE = /<title>([\s\S]*?)<\/title>/i;

// Finds the first HTML document in a reply, complete or still streaming. A
// fence counts when it is tagged html, or when its body starts like a
// document, which covers a model that forgot the tag. Works on partial text
// on purpose: the same function drives the live stream and history.
export function extractHtmlArtifact(markdown: string): HtmlArtifact | null {
  FENCE_OPEN.lastIndex = 0;
  let open: RegExpExecArray | null;
  while ((open = FENCE_OPEN.exec(markdown)) !== null) {
    const bodyStart = open.index + open[0].length;
    const close = findClosingFence(markdown, bodyStart);
    const body = close === -1 ? markdown.slice(bodyStart) : markdown.slice(bodyStart, close);
    const language = open[1].toLowerCase();
    const isHtml = language === "html" || language === "htm" || (!language && DOC_START.test(body));
    if (!isHtml) {
      if (close === -1) return null;
      FENCE_OPEN.lastIndex = close + 3;
      continue;
    }
    const complete = close !== -1;
    return {
      before: markdown.slice(0, open.index).trimEnd(),
      html: body.replace(/\n$/, ""),
      complete,
      title: titleOf(body),
      after: complete
        ? markdown
            .slice(close + 3)
            .replace(/^[^\n]*\n?/, "")
            .trimStart()
        : "",
    };
  }
  return null;
}

// A closing fence is ``` at the start of a line.
function findClosingFence(markdown: string, from: number): number {
  const re = /^```[ \t]*$/gm;
  re.lastIndex = from;
  const m = re.exec(markdown);
  return m ? m.index : -1;
}

export function titleOf(html: string): string {
  const m = TITLE.exec(html);
  const title = m ? m[1].replace(/\s+/g, " ").trim() : "";
  return title.slice(0, 120) || DEFAULT_SITE_TITLE;
}

// "Lagos Café" -> "lagos-cafe", for download and share filenames.
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 60) || "website";
}
