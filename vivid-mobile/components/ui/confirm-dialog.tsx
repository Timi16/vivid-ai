import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

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

// Used by every irreversible action: deleting a thread, signing out. It
// cannot be dismissed by tapping away, so a stray touch never confirms.
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
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      dismissable={false}
      footer={
        <>
          <Button variant="ghost" size="sm" label={cancelLabel} disabled={loading} onPress={() => onOpenChange(false)} />
          <Button
            size="sm"
            variant={tone === "danger" ? "danger" : "primary"}
            label={confirmLabel}
            loading={loading}
            onPress={onConfirm}
          />
        </>
      }
    >
      {null}
    </Modal>
  );
}
