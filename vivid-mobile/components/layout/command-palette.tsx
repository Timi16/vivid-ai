import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { setSearchOpen, useSearchOpen } from "@/components/layout/search-state";
import {
  ArtifactsIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  type IconComponent,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { AppText } from "@/components/ui/text";
import { searchEntries, useChats } from "@/features/history";
import { useTheme } from "@/hooks/use-theme";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: IconComponent;
  run: () => void;
}

// Search. Jump to any chat by title, or run the few actions people reach for.
// Mounted once in the app shell; opened from the drawer or the topbar.
export function CommandPalette() {
  const router = useRouter();
  const { theme } = useTheme();
  const open = useSearchOpen();
  const { data: chats = [] } = useChats();
  const [query, setQuery] = useState("");

  function close() {
    setQuery("");
    setSearchOpen(false);
  }

  const commands = useMemo<Command[]>(() => {
    const go = (navigate: () => void) => () => {
      close();
      navigate();
    };
    const actions: Command[] = [
      { id: "new", label: "New chat", icon: PlusIcon, run: go(() => router.push("/")) },
      {
        id: "artifacts",
        label: "Artifacts",
        icon: ArtifactsIcon,
        run: go(() => router.push("/artifacts")),
      },
      {
        id: "settings",
        label: "Settings",
        icon: SettingsIcon,
        run: go(() => router.push("/settings")),
      },
    ];
    const needle = query.trim().toLowerCase();
    const matchingActions = needle
      ? actions.filter((action) => action.label.toLowerCase().includes(needle))
      : actions;
    const matchingChats = searchEntries(chats, query)
      .slice(0, 12)
      .map<Command>((chat) => ({
        id: `chat-${chat.id}`,
        label: chat.title,
        hint: "Chat",
        run: go(() => router.push({ pathname: "/thread/[id]", params: { id: chat.id } })),
      }));
    return [...matchingActions, ...matchingChats];
  }, [chats, query, router]);

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? setSearchOpen(true) : close())}
      title="Search"
      hideTitle
    >
      <View style={{ gap: 8 }}>
        <Input
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Search chats or jump to…"
          accessibilityLabel="Search"
          leading={<SearchIcon size={16} color={theme.fg(0.45)} />}
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => commands[0]?.run()}
        />
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {commands.length === 0 ? (
            <AppText size={13} tone={0.4} style={{ paddingHorizontal: 12, paddingVertical: 16 }}>
              No matches.
            </AppText>
          ) : null}
          {commands.map((command) => {
            const Icon = command.icon;
            return (
              <Pressable
                key={command.id}
                accessibilityRole="button"
                onPress={command.run}
                style={({ pressed }) => ({
                  height: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: pressed ? theme.fg(0.1) : "transparent",
                })}
              >
                <View style={{ width: 16, alignItems: "center" }}>
                  {Icon ? <Icon size={16} color={theme.fg(0.5)} /> : null}
                </View>
                <AppText size={13.5} tone={0.8} numberOfLines={1} style={{ flex: 1 }}>
                  {command.label}
                </AppText>
                {command.hint ? (
                  <AppText size={11} tone={0.35}>
                    {command.hint}
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
