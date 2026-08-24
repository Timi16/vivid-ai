"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TAGS = [
  "Not accurate",
  "Missing detail",
  "Wrong sources",
  "Too long",
  "Too short",
  "Off topic",
];

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Which way the answer was rated, so the copy matches what was clicked.
  rating: "up" | "down" | null;
}

export function FeedbackDialog({ open, onOpenChange, rating }: FeedbackDialogProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [detail, setDetail] = useState("");

  const positive = rating === "up";

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setTags([]);
          setDetail("");
        }
      }}
      title={positive ? "What worked well?" : "What went wrong?"}
      description="Your feedback trains the model. Nothing here is shared publicly."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onOpenChange(false);
              setTags([]);
              setDetail("");
              toast("Thanks for the feedback");
            }}
          >
            Send feedback
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!positive ? (
          <div className="flex flex-wrap gap-2">
            {TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                  className={cn(
                    "vd-glass-control vd-sheen cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-medium",
                    "transition-colors",
                    on ? "border-fg/45 bg-fg/18 text-fg" : "text-fg/65 hover:text-fg"
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="feedback-detail" className="sr-only">
            Feedback
          </label>
          <Textarea
            id="feedback-detail"
            rows={4}
            placeholder={
              positive ? "What made this answer useful?" : "What would a good answer have said?"
            }
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
