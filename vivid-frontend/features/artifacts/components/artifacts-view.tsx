"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { CopyIcon, DownloadIcon, ShareIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { copyText } from "@/lib/clipboard";
import { relativeTime } from "@/lib/format";
import { ArtifactSurface, ArtifactTile } from "@/features/artifacts/components/artifact-tile";
import { MediaTransport } from "@/features/artifacts/components/media-transport";
import type { Artifact, ArtifactKind } from "@/features/artifacts/lib/data";

const FILTERS: { value: ArtifactKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
];

export function ArtifactsView({ artifacts }: { artifacts: Artifact[] }) {
  const [kind, setKind] = useState<ArtifactKind | "all">("all");
  const [open, setOpen] = useState<Artifact | null>(null);

  const shown = kind === "all" ? artifacts : artifacts.filter((a) => a.kind === kind);

  return (
    <div className="mx-auto w-full max-w-[960px] px-5 py-8">
      <PageHeader
        title="Artifacts"
        description="Everything Vivid has generated for you: images, video and audio."
      />

      <Tabs
        value={kind}
        onValueChange={(value) => setKind(value as ArtifactKind | "all")}
        className="mt-6"
      >
        <TabsList>
          {FILTERS.map((filter) => (
            <TabsTab key={filter.value} value={filter.value}>
              {filter.label}
            </TabsTab>
          ))}
          <TabsIndicator />
        </TabsList>

        {FILTERS.map((filter) => (
          <TabsPanel key={filter.value} value={filter.value} className="mt-6">
            {shown.length === 0 ? (
              <div className="vd-glass-card vd-sheen grid place-items-center px-5 py-16 text-center">
                <div className="max-w-[36ch]">
                  <p className="text-fg/85 text-[14px] font-semibold">Nothing here yet</p>
                  <p className="text-fg/50 mt-1.5 text-[12.5px] font-normal">
                    Ask Vivid to generate something and it will show up here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((artifact) => (
                  <ArtifactTile
                    key={artifact.id}
                    artifact={artifact}
                    onOpen={() => setOpen(artifact)}
                  />
                ))}
              </div>
            )}
          </TabsPanel>
        ))}
      </Tabs>

      <Modal
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        title={open?.title ?? ""}
        description={open ? `${open.meta} · ${relativeTime(new Date(open.createdAt))}` : undefined}
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const ok = await copyText(open?.prompt ?? "");
                toast(ok ? "Prompt copied" : "Couldn't copy the prompt");
              }}
            >
              <CopyIcon size={14} />
              Copy prompt
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toast("Sharing isn't available yet")}>
              <ShareIcon size={14} />
              Share
            </Button>
            <Button
              size="sm"
              onClick={() =>
                toast("Download isn't available yet", {
                  description: "This turns on once the media service ships.",
                })
              }
            >
              <DownloadIcon size={14} />
              Download
            </Button>
          </>
        }
      >
        {open ? (
          <div className="flex flex-col gap-4">
            {open.kind === "image" ? (
              <ArtifactSurface artifact={open} className="aspect-[16/10] w-full" />
            ) : (
              <MediaTransport
                duration={open.duration ?? 0}
                visual={
                  open.kind === "video" ? (
                    <ArtifactSurface artifact={open} className="aspect-video w-full" />
                  ) : (
                    <ArtifactSurface artifact={open} className="h-24 w-full" />
                  )
                }
              />
            )}

            <div className="vd-glass-well rounded-[16px] p-4">
              <p className="text-fg/40 text-[11.5px] font-semibold tracking-wide uppercase">
                Prompt
              </p>
              <p className="text-fg/70 mt-1.5 text-[13px] leading-relaxed font-normal">
                {open.prompt}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
