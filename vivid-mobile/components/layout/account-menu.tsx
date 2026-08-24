import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LogOutIcon, SettingsIcon, SparkIcon } from "@/components/ui/icons";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { stopPlayback } from "@/lib/backend/audio";
import { setTokens } from "@/lib/backend/client";
import { closeChatSocket } from "@/lib/backend/ws";

interface AccountMenuProps {
  name: string;
  avatarUrl?: string | null;
  plan: string;
  onNavigate?: () => void;
}

export function AccountMenu({ name, avatarUrl, plan, onNavigate }: AccountMenuProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  function go(href: "/settings" | "/upgrade") {
    setMenuOpen(false);
    onNavigate?.();
    router.push(href);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account menu"
        onPress={() => setMenuOpen(true)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 6,
          borderRadius: 12,
          backgroundColor: pressed ? theme.fg(0.08) : "transparent",
        })}
      >
        <Avatar name={name} src={avatarUrl} size="sm" />
        <View style={{ flex: 1 }}>
          <AppText size={13} weight="semibold" tone={0.85} numberOfLines={1}>
            {name}
          </AppText>
          <AppText size={11} weight="regular" tone={0.4} numberOfLines={1}>
            {plan}
          </AppText>
        </View>
      </Pressable>

      <Menu open={menuOpen} onOpenChange={setMenuOpen} title={name}>
        <MenuItem
          label="Settings"
          icon={<SettingsIcon size={16} color={theme.fg(0.8)} />}
          onPress={() => go("/settings")}
        />
        <MenuItem
          label="Upgrade plan"
          icon={<SparkIcon size={16} color={theme.fg(0.8)} />}
          onPress={() => go("/upgrade")}
        />
        <MenuSeparator />
        <MenuItem
          label="Sign out"
          tone="danger"
          icon={<LogOutIcon size={16} color={theme.colors.down} />}
          onPress={() => {
            setMenuOpen(false);
            setSignOutOpen(true);
          }}
        />
      </Menu>

      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out of Vivid?"
        description="You will need to sign in again to get back to your threads."
        confirmLabel="Sign out"
        onConfirm={() => {
          setSignOutOpen(false);
          onNavigate?.();
          stopPlayback();
          closeChatSocket();
          // Clearing the tokens is the sign-out: the root stack observes it
          // and swaps the signed-in shell for the auth screens.
          setTokens(null);
        }}
      />
    </>
  );
}
