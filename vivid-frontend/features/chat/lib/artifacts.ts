// An artifact is something the assistant made that deserves its own surface
// beside the chat: a code block, or a generated file.
export type Artifact =
  | { kind: "code"; title: string; language: string; content: string }
  | { kind: "file"; title: string; url: string; mime: string };

// Languages whose code blocks can be shown as a live preview.
export function isPreviewable(language: string): boolean {
  return ["html", "svg"].includes(language.toLowerCase());
}

export function fileExtension(language: string): string {
  const map: Record<string, string> = {
    python: "py",
    javascript: "js",
    typescript: "ts",
    tsx: "tsx",
    jsx: "jsx",
    html: "html",
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
