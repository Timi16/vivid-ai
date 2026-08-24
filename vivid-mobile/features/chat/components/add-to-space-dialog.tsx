import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { FolderPlusIcon, SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SelectRow } from "@/components/ui/select-row";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { toast } from "@/lib/toast";

interface AddToSpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Spaces to choose from. The route owns them, so this feature does not
  // need to know how spaces are loaded.
  spaces: { id: string; name: string; count: number }[];
}

export function AddToSpaceDialog({ open, onOpenChange, spaces }: AddToSpaceDialogProps) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = spaces.filter((space) =>
    space.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  function reset() {
    setQuery("");
    setSelected(null);
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title="Add to a space"
      description="Spaces group related threads so you can come back to them together."
      footer={
        <>
          <Button variant="ghost" size="sm" label="Cancel" onPress={() => onOpenChange(false)} />
          <Button
            size="sm"
            label="Add"
            disabled={!selected}
            onPress={() => {
              const space = spaces.find((s) => s.id === selected);
              onOpenChange(false);
              reset();
              toast(`Added to ${space?.name ?? "the space"}`);
            }}
          />
        </>
      }
    >
      <View style={{ gap: 12 }}>
        <Input
          placeholder="Find a space"
          accessibilityLabel="Find a space"
          value={query}
          onChangeText={setQuery}
          leading={<SearchIcon size={16} color={theme.fg(0.35)} />}
        />
        <View style={{ gap: 6 }}>
          {filtered.length === 0 ? (
            <AppText
              size={12.5}
              weight="regular"
              tone={0.45}
              align="center"
              style={{ paddingVertical: 24 }}
            >
              No space matches “{query.trim()}”.
            </AppText>
          ) : (
            filtered.map((space) => (
              <SelectRow
                key={space.id}
                title={space.name}
                selected={selected === space.id}
                onPress={() => setSelected(space.id)}
                leading={<FolderPlusIcon size={16} color={theme.fg(0.45)} />}
                trailing={
                  <AppText size={11.5} weight="regular" tone={0.4}>
                    {space.count}
                  </AppText>
                }
              />
            ))
          )}
        </View>
      </View>
    </Modal>
  );
}
