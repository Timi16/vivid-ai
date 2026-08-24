import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  onRename: (title: string) => void;
}

export function RenameDialog({ open, onOpenChange, currentTitle, onRename }: RenameDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  // Reopening after a cancel should show the title as it currently stands
  // rather than whatever was typed last time. Adjusted during render rather
  // than in an effect, so the stale title never paints first.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(currentTitle);
      setError(null);
    }
  }

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("A thread needs a name.");
      return;
    }
    onRename(trimmed);
    onOpenChange(false);
    toast("Thread renamed");
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Rename thread"
      footer={
        <>
          <Button variant="ghost" size="sm" label="Cancel" onPress={() => onOpenChange(false)} />
          <Button size="sm" label="Save" onPress={submit} />
        </>
      }
    >
      <Field label="Name" error={error ?? undefined}>
        <Input
          autoFocus
          value={title}
          invalid={Boolean(error)}
          onChangeText={(value) => {
            setTitle(value);
            if (error) setError(null);
          }}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      </Field>
    </Modal>
  );
}
