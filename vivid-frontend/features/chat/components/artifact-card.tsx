"use client";

import { GlobeIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface ArtifactCardProps {
  title: string;
  // True while the fence is still open in a streaming reply.
  generating?: boolean;
  onOpen?: () => void;
}

// What a website looks like inside the conversation: a compact card, not
// three hundred lines of HTML. Opens the artifact panel beside the chat.
export function ArtifactCard({ title, generating = false, onOpen }: ArtifactCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className={cn(
        "vd-glass-card vd-sheen vd-glass-hover my-3 flex w-full max-w-[420px] cursor-pointer items-center gap-3 rounded-[16px] px-3.5 py-3 text-left",
        !onOpen && "cursor-default"
      )}
    >
      <span className="bg-fg/10 text-fg/85 grid size-10 shrink-0 place-items-center rounded-[12px]">
        {generating ? (
          <span className="border-fg/20 border-t-fg/70 size-4 animate-spin rounded-full border-2" />
        ) : (
          <GlobeIcon size={19} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-fg truncate text-[13.5px] font-semibold">
          {generating ? "Building your website…" : title}
        </span>
        <span className="text-fg/45 text-[11.5px] font-normal">
          {generating ? "Watch it come together in the preview" : "Website · HTML · tap to preview"}
        </span>
      </span>
      {onOpen ? (
        <span className="vd-glass-control text-fg/80 shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold">
          {generating ? "Watch" : "Open"}
        </span>
      ) : null}
    </button>
  );
}
