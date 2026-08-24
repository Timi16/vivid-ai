"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CloseIcon, CopyIcon, DownloadIcon } from "@/components/ui/icons";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { fileExtension, isPreviewable, type Artifact } from "@/features/chat/lib/artifacts";

interface ArtifactPanelProps {
  artifact: Artifact;
  onClose: () => void;
  className?: string;
}

// The surface beside the chat for something the assistant made. Code gets
// copy, download and (for HTML) a sandboxed live preview; files open inline
// where the browser can render them.
export function ArtifactPanel({ artifact, onClose, className }: ArtifactPanelProps) {
  const [view, setView] = useState<"preview" | "code">(
    artifact.kind === "code" && isPreviewable(artifact.language) ? "preview" : "code"
  );

  async function copy() {
    if (artifact.kind !== "code") return;
    await copyText(artifact.content);
    toast("Copied");
  }

  function download() {
    if (artifact.kind === "file") {
      window.open(artifact.url, "_blank", "noreferrer");
      return;
    }
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${artifact.title || "artifact"}.${fileExtension(artifact.language)}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const previewable = artifact.kind === "code" && isPreviewable(artifact.language);

  return (
    <section
      aria-label="Artifact"
      className={cn("vd-glass-card flex min-h-0 flex-col overflow-hidden", className)}
    >
      <header className="border-fg/8 flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-fg/85 min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {artifact.title}
        </span>
        {previewable ? (
          <div className="vd-glass-control flex rounded-full p-0.5 text-[12px]">
            {(["preview", "code"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={cn(
                  "cursor-pointer rounded-full px-2.5 py-1 capitalize",
                  view === option ? "bg-fg/15 text-fg" : "text-fg/55"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
        {artifact.kind === "code" ? (
          <PanelButton label="Copy" onClick={copy}>
            <CopyIcon size={15} />
          </PanelButton>
        ) : null}
        <PanelButton label="Download" onClick={download}>
          <DownloadIcon size={15} />
        </PanelButton>
        <PanelButton label="Close" onClick={onClose}>
          <CloseIcon size={15} />
        </PanelButton>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {artifact.kind === "code" ? (
          view === "preview" ? (
            <iframe
              title="Preview"
              sandbox="allow-scripts"
              srcDoc={artifact.content}
              className="h-full min-h-[420px] w-full bg-white"
            />
          ) : (
            <pre className="text-fg/85 p-4 font-mono text-[12.5px] leading-[1.6] whitespace-pre">
              {artifact.content}
            </pre>
          )
        ) : artifact.mime.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artifact.url} alt={artifact.title} className="mx-auto max-h-full p-3" />
        ) : artifact.mime === "application/pdf" ? (
          <iframe title={artifact.title} src={artifact.url} className="h-full min-h-[560px] w-full" />
        ) : (
          <div className="text-fg/60 flex flex-col items-center gap-3 p-10 text-center text-[13.5px]">
            <span className="text-4xl">📄</span>
            <span>{artifact.title}</span>
            <span className="text-fg/40 text-[12px]">{artifact.mime}</span>
            <button
              type="button"
              onClick={download}
              className="vd-glass-bright cursor-pointer rounded-full px-4 py-2 text-[12.5px] font-semibold"
            >
              Download
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function PanelButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="hover:vd-glass-control text-fg/55 hover:text-fg grid size-8 cursor-pointer place-items-center rounded-lg transition-colors"
    >
      {children}
    </button>
  );
}
