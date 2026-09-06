"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  RefreshIcon,
} from "@/components/ui/icons";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import {
  fileExtension,
  isPreviewable,
  slugify,
  type Artifact,
} from "@/features/chat/lib/artifacts";

interface ArtifactPanelProps {
  artifact: Artifact;
  // The reply is still streaming this artifact's code: show it arriving,
  // then flip to the preview the moment it is complete.
  generating?: boolean;
  onClose: () => void;
  className?: string;
}

type Viewport = "desktop" | "phone";

const PHONE_WIDTH = 390;

// The surface beside the chat for something the assistant made. Websites
// run in a sandboxed iframe with a phone/desktop toggle, refresh and open in
// a tab; other code gets copy and download; files open inline where the
// browser can render them.
export function ArtifactPanel({
  artifact,
  generating = false,
  onClose,
  className,
}: ArtifactPanelProps) {
  // A website previews as a page; code that produced a picture or a clip
  // previews as that result. Either way the reader lands on the thing they
  // asked for, with the code one tab away.
  const site = artifact.kind === "code" && isPreviewable(artifact.language);
  const result = artifact.kind === "code" ? artifact.result : undefined;
  const previewable = site || Boolean(result);
  const [view, setView] = useState<"preview" | "code">(
    previewable && !generating ? "preview" : "code"
  );
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [refreshKey, setRefreshKey] = useState(0);
  const codeRef = useRef<HTMLPreElement>(null);

  // Code streams in while building; follow it. When the build finishes, the
  // page is what matters, so switch to the preview without being asked.
  const wasGenerating = useRef(generating);
  useEffect(() => {
    if (generating && codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
    if (wasGenerating.current && !generating && previewable) {
      setView("preview");
      setRefreshKey((key) => key + 1);
    }
    wasGenerating.current = generating;
  }, [generating, previewable, artifact]);

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
    if (result && view === "preview") {
      window.open(result.url, "_blank", "noreferrer");
      return;
    }
    const blob = new Blob([artifact.content], {
      type: site ? "text/html" : "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(artifact.title)}.${fileExtension(artifact.language)}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // The page in its own tab, at full size, no sandbox frame around it.
  function openInTab() {
    if (artifact.kind !== "code") return;
    const blob = new Blob([artifact.content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const showPreview = previewable && view === "preview" && !generating;

  return (
    <section
      aria-label="Artifact"
      className={cn("vd-glass-card flex min-h-0 flex-col overflow-hidden", className)}
    >
      <header className="border-fg/8 flex h-12 shrink-0 items-center gap-2 border-b px-3">
        {generating ? (
          <span className="border-fg/20 border-t-fg/70 size-3.5 shrink-0 animate-spin rounded-full border-2" />
        ) : null}
        <span className="text-fg/85 min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {generating ? "Building your website…" : artifact.title}
        </span>

        {previewable && !generating ? (
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

        {showPreview && site ? (
          <>
            <div className="vd-glass-control hidden rounded-full p-0.5 text-[12px] sm:flex">
              {(["desktop", "phone"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setViewport(option)}
                  className={cn(
                    "cursor-pointer rounded-full px-2.5 py-1 capitalize",
                    viewport === option ? "bg-fg/15 text-fg" : "text-fg/55"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <PanelButton label="Reload preview" onClick={() => setRefreshKey((key) => key + 1)}>
              <RefreshIcon size={15} />
            </PanelButton>
            <PanelButton label="Open in a new tab" onClick={openInTab}>
              <ExternalLinkIcon size={15} />
            </PanelButton>
          </>
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
          showPreview && result ? (
            <div className="grid h-full min-h-[420px] place-items-center p-3">
              {result.mime.startsWith("video/") ? (
                <video
                  src={result.url}
                  controls
                  preload="metadata"
                  className="max-h-full max-w-full rounded-xl bg-black"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.url} alt={result.title} className="max-h-full max-w-full" />
              )}
            </div>
          ) : showPreview ? (
            <div
              className={cn(
                "h-full min-h-[420px]",
                viewport === "phone" && "bg-fg/4 flex items-start justify-center p-4"
              )}
            >
              <iframe
                key={refreshKey}
                title="Preview"
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                srcDoc={artifact.content}
                className={cn(
                  "bg-white",
                  viewport === "phone"
                    ? "border-fg/15 h-[calc(100%-2rem)] min-h-[600px] rounded-[22px] border shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
                    : "h-full min-h-[420px] w-full"
                )}
                style={viewport === "phone" ? { width: PHONE_WIDTH } : undefined}
              />
            </div>
          ) : (
            <pre
              ref={codeRef}
              className="text-fg/85 h-full overflow-auto p-4 font-mono text-[12.5px] leading-[1.6] whitespace-pre"
            >
              {artifact.content}
              {generating ? (
                <span className="bg-fg/70 ml-0.5 inline-block h-[1.1em] w-[7px] animate-pulse align-text-bottom" />
              ) : null}
            </pre>
          )
        ) : artifact.mime.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artifact.url} alt={artifact.title} className="mx-auto max-h-full p-3" />
        ) : artifact.mime === "application/pdf" || artifact.mime === "text/html" ? (
          <iframe
            title={artifact.title}
            src={artifact.url}
            sandbox={
              artifact.mime === "text/html"
                ? "allow-scripts allow-forms allow-modals allow-popups"
                : undefined
            }
            className="h-full min-h-[560px] w-full bg-white"
          />
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
      className="hover:vd-glass-control text-fg/55 hover:text-fg grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg transition-colors"
    >
      {children}
    </button>
  );
}
