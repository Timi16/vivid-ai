"use client";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { LinkIcon } from "@/components/ui/icons";
import type { Source } from "@/features/chat/lib/types";

interface SourceDialogProps {
  source: Source | null;
  onClose: () => void;
}

// Opening a citation. Shows what was drawn on and links out, rather than
// embedding the page, which would need a proxy and would break most sites.
export function SourceDialog({ source, onClose }: SourceDialogProps) {
  return (
    <Modal
      open={Boolean(source)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={source?.title ?? ""}
      description={source?.domain}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (source) window.open(source.url, "_blank", "noopener,noreferrer");
            }}
          >
            <LinkIcon size={14} />
            Open source
          </Button>
        </>
      }
    >
      {source ? (
        <blockquote className="vd-glass-well text-fg/70 rounded-[16px] p-4 text-[13px] leading-relaxed font-normal">
          {source.snippet}
        </blockquote>
      ) : null}
    </Modal>
  );
}
