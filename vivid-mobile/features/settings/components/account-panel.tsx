import { useState } from "react";
import { View } from "react-native";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LogOutIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { AppText } from "@/components/ui/text";
import { useUpdateName } from "@/hooks/use-me";
import { useTheme } from "@/hooks/use-theme";
import { stopPlayback } from "@/lib/backend/audio";
import { setTokens } from "@/lib/backend/client";
import { closeChatSocket } from "@/lib/backend/ws";
import { toast } from "@/lib/toast";
import { SettingGroup, SettingRow } from "@/features/settings/components/setting-row";

interface AccountPanelProps {
  name: string;
  email: string;
  avatarUrl?: string | null;
  plan: string;
  // Rendered in the plan row. The route passes it so settings never imports the
  // billing slice.
  planActionSlot?: React.ReactNode;
}

export function AccountPanel({ name, email, avatarUrl, plan, planActionSlot }: AccountPanelProps) {
  const { theme } = useTheme();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const updateName = useUpdateName();

  async function saveName() {
    const next = draftName.trim();
    if (!next || next === name) {
      setEditingName(false);
      return;
    }
    try {
      await updateName.mutateAsync(next);
      setEditingName(false);
      toast("Name updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update your name");
    }
  }

  return (
    <View style={{ gap: 24 }}>
      <SettingGroup>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 16 }}>
          <Avatar name={name} src={avatarUrl} size="lg" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size={15} weight="semibold" numberOfLines={1}>
              {name}
            </AppText>
            <AppText size={12.5} weight="regular" tone={0.5} numberOfLines={1}>
              {email}
            </AppText>
          </View>
        </View>
        <SettingRow
          label="Display name"
          detail="How Vivid addresses you across the app."
          control={
            editingName ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Input
                  value={draftName}
                  onChangeText={setDraftName}
                  onSubmitEditing={() => void saveName()}
                  returnKeyType="done"
                  autoFocus
                  accessibilityLabel="Display name"
                  containerStyle={{ width: 150, minHeight: 36 }}
                  style={{ paddingVertical: 6, fontSize: 13 }}
                />
                <Button
                  size="sm"
                  label="Save"
                  loading={updateName.isPending}
                  onPress={() => void saveName()}
                />
              </View>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                label="Edit"
                onPress={() => {
                  setDraftName(name);
                  setEditingName(true);
                }}
              />
            )
          }
        />
        <SettingRow label="Plan" detail={`You are on ${plan}.`} control={planActionSlot} />
      </SettingGroup>

      <SettingGroup title="Session">
        <SettingRow
          label="Sign out"
          detail="Sign out of Vivid on this device."
          control={
            <Button
              variant="secondary"
              size="sm"
              label="Sign out"
              icon={<LogOutIcon size={15} color={theme.colors.fg} />}
              onPress={() => setSignOutOpen(true)}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="Danger zone">
        <SettingRow
          label="Delete account"
          detail="Removes your account, threads, spaces and generated media. This cannot be undone."
          control={
            <Button
              variant="danger"
              size="sm"
              label="Delete account"
              onPress={() => setDeleteOpen(true)}
            />
          }
        />
      </SettingGroup>

      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out of Vivid?"
        description="You will need to sign in again to get back to your threads."
        confirmLabel="Sign out"
        onConfirm={() => {
          setSignOutOpen(false);
          stopPlayback();
          closeChatSocket();
          // Clearing the tokens is the sign-out: the root stack observes it
          // and swaps the signed-in shell for the auth screens.
          setTokens(null);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        title="Delete your account?"
        description="Every thread, space and generated file is removed permanently. This cannot be undone."
        confirmLabel="Delete account"
        onConfirm={() => {
          setDeleteOpen(false);
          toast("Account deletion isn't available yet", {
            description: "This turns on once the account service ships.",
          });
        }}
      />
    </View>
  );
}
