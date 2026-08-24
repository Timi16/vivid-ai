"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// Assistant text is markdown (the model is prompted to use code blocks,
// lists, tables, and LaTeX math — $...$ inline, $$...$$ display, rendered by
// KaTeX). Styled via the .vd-md rules in globals.css so it sits inside the
// thread typography rather than looking pasted in.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="vd-md text-fg/85 text-[15px] leading-[1.75]">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
