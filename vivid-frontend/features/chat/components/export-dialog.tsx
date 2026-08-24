"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { EXPORT_FORMATS, type ExportFormat } from "@/features/chat/lib/types";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionTitle: string;
}

// Exporting a thread. There is no export service, so this confirms the choice
// and says plainly that the file is not produced yet rather than downloading an
// empty document.
export function ExportDialog({ open, onOpenChange, sessionTitle }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("markdown");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Export thread"
      description={`Choose a format for "${sessionTitle}".`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onOpenChange(false);
              toast("Export isn't available yet", {
                description: "This turns on once the export service ships.",
              });
            }}
          >
            Export
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Export format</legend>
        {EXPORT_FORMATS.map((option) => {
          const on = format === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "vd-glass-control vd-sheen flex cursor-pointer items-start gap-3 rounded-[14px] p-3.5",
                "hover:border-fg/28 transition-colors",
                on && "border-fg/45 bg-fg/14"
              )}
            >
              <input
                type="radio"
                name="export-format"
                value={option.value}
                checked={on}
                onChange={() => setFormat(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                  on ? "border-fg bg-fg" : "border-fg/30"
                )}
              >
                {on ? <span className="bg-fg-invert size-1.5 rounded-full" /> : null}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-fg text-[13px] font-semibold">{option.label}</span>
                <span className="text-fg/50 text-[12px] font-normal">{option.detail}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </Modal>
  );
}
