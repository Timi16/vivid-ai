"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Destructive confirms get the danger button. Everything else gets primary.
  tone?: "default" | "danger";
  loading?: boolean;
  onConfirm: () => void;
}

// Used by every irreversible action: deleting a session, clearing history,
// logging out. An alert dialog rather than a plain one, so it traps focus and
// cannot be dismissed by clicking away.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[3px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup
          className={cn(
            "vd-glass-sheet vd-sheen fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] p-6",
            "transition-all duration-200 data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0"
          )}
        >
          <AlertDialog.Title className="ws-display text-fg text-[17px]">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-fg/55 mt-2 text-[13px] leading-relaxed font-normal">
            {description}
          </AlertDialog.Description>

          <div className="mt-6 flex items-center justify-end gap-2">
            <AlertDialog.Close
              render={
                <Button variant="ghost" size="sm" disabled={loading}>
                  {cancelLabel}
                </Button>
              }
            />
            <Button
              size="sm"
              variant={tone === "danger" ? "danger" : "primary"}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
