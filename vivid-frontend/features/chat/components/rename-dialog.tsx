"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

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

  // Reopening on a different session, or after a cancel, should show the title
  // as it currently stands rather than whatever was typed last time.
  //
  // Adjusted during render rather than in an effect. An effect would paint the
  // stale title first and then correct it, and the React Compiler rejects a
  // synchronous setState in one anyway.
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
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field htmlFor="thread-title" label="Name" error={error ?? undefined}>
          <Input
            id="thread-title"
            autoFocus
            value={title}
            invalid={Boolean(error)}
            onChange={(event) => {
              setTitle(event.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
      </form>
    </Modal>
  );
}
