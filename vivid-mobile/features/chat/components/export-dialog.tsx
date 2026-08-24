import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SelectRow } from "@/components/ui/select-row";
import { toast } from "@/lib/toast";
import { EXPORT_FORMATS, type ExportFormat } from "@/features/chat/lib/types";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionTitle: string;
}

// Exporting a thread. There is no export service, so this confirms the
// choice and says plainly that the file is not produced yet rather than
// producing an empty document.
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
          <Button variant="ghost" size="sm" label="Cancel" onPress={() => onOpenChange(false)} />
          <Button
            size="sm"
            label="Export"
            onPress={() => {
              onOpenChange(false);
              toast("Export isn't available yet", {
                description: "This turns on once the export service ships.",
              });
            }}
          />
        </>
      }
    >
      <View style={{ gap: 8 }}>
        {EXPORT_FORMATS.map((option) => (
          <SelectRow
            key={option.value}
            radio
            title={option.label}
            detail={option.detail}
            selected={format === option.value}
            onPress={() => setFormat(option.value)}
          />
        ))}
      </View>
    </Modal>
  );
}
