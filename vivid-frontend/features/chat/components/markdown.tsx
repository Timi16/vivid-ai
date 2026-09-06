"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { CopyIcon } from "@/components/ui/icons";
import { copyText } from "@/lib/clipboard";
import { ArtifactCard } from "@/features/chat/components/artifact-card";
import { isPreviewable, titleOf, type Artifact } from "@/features/chat/lib/artifacts";

interface MarkdownProps {
  children: string;
  // When given, fenced code blocks get an "Open" action that hands the block
  // to the artifact panel, and html blocks render as a website card.
  onOpenArtifact?: (artifact: Artifact) => void;
  // The reply is still streaming and its html fence has not closed yet.
  generating?: boolean;
}

// Assistant text is markdown (the model is prompted to use code blocks,
// lists, tables, and LaTeX math, rendered by KaTeX). Styled via the .vd-md
// rules in globals.css so it sits inside the thread typography.
export function Markdown({ children, onOpenArtifact, generating = false }: MarkdownProps) {
  return (
    // overflow-wrap:anywhere: a reply with one unbroken run (a long URL, a
    // hash, a model that streams base64) must wrap inside the column instead
    // of widening the page.
    <div className="vd-md text-fg/85 text-[15px] leading-[1.75] [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // The block wrapper is rendered by CodeBlock itself.
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children ?? "");
            const match = /language-([\w-]+)/.exec(className ?? "");
            const isBlock = Boolean(match) || text.includes("\n");
            if (!isBlock) return <code className={className}>{children}</code>;
            const language = match?.[1] ?? "text";
            const code = text.replace(/\n$/, "");
            if (onOpenArtifact && isPreviewable(language)) {
              const title = titleOf(code);
              return (
                <ArtifactCard
                  title={title}
                  generating={generating}
                  onOpen={() =>
                    onOpenArtifact({ kind: "code", title, language: "html", content: code })
                  }
                />
              );
            }
            return <CodeBlock language={language} code={code} onOpen={onOpenArtifact} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({
  language,
  code,
  onOpen,
}: {
  language: string;
  code: string;
  onOpen?: (artifact: Artifact) => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="vd-code-block my-3 overflow-hidden rounded-xl">
      <div className="bg-fg/6 text-fg/55 flex h-8 items-center gap-2 px-3 text-[11.5px] font-medium">
        <span className="flex-1 lowercase">{language}</span>
        {onOpen ? (
          <button
            type="button"
            onClick={() =>
              onOpen({ kind: "code", title: `${language} snippet`, language, content: code })
            }
            className="hover:text-fg cursor-pointer"
          >
            Open
          </button>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            await copyText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="hover:text-fg flex cursor-pointer items-center gap-1"
        >
          <CopyIcon size={12} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-3.5 text-[12.5px] leading-[1.6]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
