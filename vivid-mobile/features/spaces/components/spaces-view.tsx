import { useState } from "react";
import { View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Glass } from "@/components/ui/glass";
import { PlusIcon, SpacesIcon } from "@/components/ui/icons";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { relativeTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { SPACES, type Space } from "@/features/spaces/lib/data";

export function SpacesView() {
  const { theme } = useTheme();
  // The route renders the view bare, so the fixture is read here rather than
  // passed in. This is the one line to change once a spaces endpoint exists.
  const spaces: Space[] = SPACES;
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <View>
      <PageHeader
        title="Spaces"
        description="Group related threads so you can pick a subject back up where you left it."
        actions={
          <Button
            size="md"
            label="New space"
            icon={<PlusIcon size={16} color={theme.colors.ink} />}
            onPress={() => setCreateOpen(true)}
          />
        }
      />

      <View style={{ marginTop: 28, gap: 12 }}>
        {spaces.map((space) => (
          <Glass key={space.id} tier="card" sheen blur={false} style={{ gap: 12, padding: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <Glass
                tier="control"
                blur={false}
                radius={12}
                style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
              >
                <SpacesIcon size={17} color={theme.fg(0.7)} />
              </Glass>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size={14} weight="semibold" numberOfLines={1}>
                  {space.name}
                </AppText>
                <AppText size={12} weight="regular" tone={0.45}>
                  {space.threadCount} threads · {relativeTime(new Date(space.updatedAt))}
                </AppText>
              </View>
            </View>
            <AppText size={12.5} weight="regular" tone={0.55} lineHeight={20} numberOfLines={2}>
              {space.description}
            </AppText>
          </Glass>
        ))}
      </View>

      <Modal
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) {
            setName("");
            setDescription("");
            setError(null);
          }
        }}
        title="New space"
        description="Give it a name now; you can add threads to it at any time."
        footer={
          <>
            <Button variant="ghost" size="sm" label="Cancel" onPress={() => setCreateOpen(false)} />
            <Button
              size="sm"
              label="Create space"
              onPress={() => {
                if (!name.trim()) {
                  setError("A space needs a name.");
                  return;
                }
                setCreateOpen(false);
                toast(`Created "${name.trim()}"`);
                setName("");
                setDescription("");
              }}
            />
          </>
        }
      >
        <View style={{ gap: 16 }}>
          <Field label="Name" required error={error ?? undefined}>
            <Input
              autoFocus
              placeholder="Optics and materials"
              value={name}
              invalid={Boolean(error)}
              onChangeText={(value) => {
                setName(value);
                if (error) setError(null);
              }}
            />
          </Field>

          <Field label="Description" hint="Optional.">
            <Textarea
              rows={3}
              placeholder="What belongs in this space?"
              value={description}
              onChangeText={setDescription}
            />
          </Field>
        </View>
      </Modal>
    </View>
  );
}
