import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SelectRow } from "@/components/ui/select-row";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { toast } from "@/lib/toast";
import { REPORT_REASONS, type ReportReason } from "@/features/chat/lib/types";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportDialog({ open, onOpenChange }: ReportDialogProps) {
  const { theme } = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setReason(null);
    setDetail("");
    setError(null);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title="Report this session"
      description="Tell us what's wrong. Reports are reviewed by the safety team."
      footer={
        <>
          <Button variant="ghost" size="sm" label="Cancel" onPress={() => onOpenChange(false)} />
          <Button
            size="sm"
            variant="danger"
            label="Submit report"
            onPress={() => {
              if (!reason) {
                setError("Pick a reason so we know what to look at.");
                return;
              }
              onOpenChange(false);
              reset();
              toast("Report submitted", { description: "Thanks. We'll take a look at this session." });
            }}
          />
        </>
      }
    >
      <View style={{ gap: 16 }}>
        <View style={{ gap: 8 }}>
          {REPORT_REASONS.map((option) => (
            <SelectRow
              key={option.value}
              radio
              title={option.label}
              selected={reason === option.value}
              onPress={() => {
                setReason(option.value);
                setError(null);
              }}
            />
          ))}
        </View>
        {error ? (
          <AppText size={12} weight="regular" color={theme.colors.down} accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
        <Field label="Anything else? (optional)">
          <Textarea rows={3} placeholder="Add any detail that would help us understand the problem." value={detail} onChangeText={setDetail} />
        </Field>
      </View>
    </Modal>
  );
}
