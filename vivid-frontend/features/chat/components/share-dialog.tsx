"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { CopyIcon, LinkIcon } from "@/components/ui/icons";
import { copyText } from "@/lib/clipboard";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
}

// Sharing a thread. The link is real and points at this app, so copying it
// gives something that resolves, but the thread is not actually published
// anywhere until there is a service to publish it to.
export function ShareDialog({ open, onOpenChange, sessionId }: ShareDialogProps) {
  const [publicLink, setPublicLink] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/thread/${sessionId}`;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Share thread"
      description="Anyone with the link can read this thread. Your account stays private."
    >
      <div className="flex flex-col gap-4">
        <div className="vd-glass-well flex items-center gap-2.5 rounded-[14px] p-3">
          <LinkIcon size={16} className="text-fg/40 shrink-0" />
          <span className="text-fg/70 truncate font-mono text-[12.5px]">{url}</span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto shrink-0"
            onClick={async () => {
              const ok = await copyText(url);
              toast(ok ? "Link copied" : "Couldn't copy the link", {
                description: ok ? undefined : "Copy it from the field instead.",
              });
            }}
          >
            <CopyIcon size={14} />
            Copy
          </Button>
        </div>

        <label className="vd-glass-control vd-sheen flex cursor-pointer items-center gap-3 rounded-[14px] p-3.5">
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-fg text-[13px] font-semibold">Make it public</span>
            <span className="text-fg/50 text-[12px] font-normal">
              Listed on your profile and discoverable.
            </span>
          </span>
          <Switch checked={publicLink} onCheckedChange={setPublicLink} />
        </label>
      </div>
    </Modal>
  );
}
