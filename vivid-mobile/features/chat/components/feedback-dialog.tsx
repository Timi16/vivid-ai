import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";

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
  // Which way the answer was rated, so the copy matches what was tapped.
  rating: "up" | "down" | null;
}

export function FeedbackDialog({ open, onOpenChange, rating }: FeedbackDialogProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const positive = rating === "up";

  function reset() {
    setTags([]);
    setDetail("");
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title={positive ? "What worked well?" : "What went wrong?"}
      description="Your feedback trains the model. Nothing here is shared publicly."
      footer={
        <>
          <Button variant="ghost" size="sm" label="Skip" onPress={() => onOpenChange(false)} />
          <Button
            size="sm"
            label="Send feedback"
            onPress={() => {
              onOpenChange(false);
              reset();
              toast("Thanks for the feedback");
            }}
          />
        </>
      }
    >
      <View style={{ gap: 16 }}>
        {!positive ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TAGS.map((tag) => (
              <Chip
                key={tag}
                size="sm"
                label={tag}
                selected={tags.includes(tag)}
                onPress={() =>
                  setTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                  )
                }
              />
            ))}
          </View>
        ) : null}
        <Textarea
          rows={4}
          accessibilityLabel="Feedback"
          placeholder={
            positive ? "What made this answer useful?" : "What would a good answer have said?"
          }
          value={detail}
          onChangeText={setDetail}
        />
      </View>
    </Modal>
  );
}
