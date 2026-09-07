import { useRouter } from "expo-router";
import type { DrawerContentComponentProps } from "expo-router/drawer";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountMenu } from "@/components/layout/account-menu";
import { primaryNav, secondaryNav, type AppHref } from "@/components/layout/nav-items";
import { setSearchOpen } from "@/components/layout/search-state";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Glass } from "@/components/ui/glass";
import {
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  VividLogo,
  type IconComponent,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { AppText } from "@/components/ui/text";
import {
  groupByAge,
  useChats,
  useDeleteChat,
  useUpdateChat,
  type HistoryEntry,
} from "@/features/history";
import { displayName, useMe } from "@/hooks/use-me";
import { useTheme } from "@/hooks/use-theme";

// The drawer is the user's conversations. New chat and search on top, recent
// chats grouped by age in the middle (pinned ones first), the rest of the app
// and the account at the bottom. Mirrors the web sidebar.
export function DrawerContent({ state, navigation }: DrawerContentComponentProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: me } = useMe();
  const { data: chats = [] } = useChats();

  const route = state.routes[state.index];
  const activeName = route?.name;
  const activeChatId =
    activeName === "thread/[id]" ? (route?.params as { id?: string } | undefined)?.id : undefined;

  const pinned = chats.filter((chat) => chat.pinned);
  const groups = groupByAge(chats.filter((chat) => !chat.pinned));

  function go(href: AppHref) {
    navigation.closeDrawer();
    router.push(href);
  }

  function openChat(id: string) {
    navigation.closeDrawer();
    router.push({ pathname: "/thread/[id]", params: { id } });
  }

  return (
    <Glass
      tier="base"
      radius={0}
      style={{
        flex: 1,
        borderWidth: 0,
        borderRightWidth: 1,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{ height: 56, justifyContent: "center", paddingHorizontal: 20 }}>
        {/* The mark rather than the word. It still has to announce itself to a
            screen reader, which the text was doing implicitly. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Vivid"
          onPress={() => go("/")}
          hitSlop={8}
          style={{ alignSelf: "flex-start" }}
        >
          <VividLogo size={26} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 8, gap: 2 }}>
        <RailButton
          label="New chat"
          icon={PlusIcon}
          active={activeName === "index"}
          onPress={() => go("/")}
        />
        <RailButton
          label="Search"
          icon={SearchIcon}
          onPress={() => {
            navigation.closeDrawer();
            setSearchOpen(true);
          }}
        />
        {primaryNav.map(({ label, name, href, icon }) => (
          <RailButton
            key={name}
            label={label}
            icon={icon}
            active={activeName === name}
            onPress={() => go(href)}
          />
        ))}
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: 12 }}
        contentContainerStyle={{ paddingHorizontal: 8 }}
      >
        {pinned.length ? (
          <ChatGroup
            label="Pinned"
            entries={pinned}
            activeChatId={activeChatId}
            onOpen={openChat}
          />
        ) : null}
        {groups.map((group) => (
          <ChatGroup
            key={group.label}
            label={group.label}
            entries={group.entries}
            activeChatId={activeChatId}
            onOpen={openChat}
          />
        ))}
        {!chats.length ? (
          <AppText size={12.5} tone={0.35} style={{ paddingHorizontal: 10, paddingVertical: 12 }}>
            Your chats will show up here.
          </AppText>
        ) : null}
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.fg(0.08),
          paddingHorizontal: 8,
          paddingTop: 8,
          gap: 2,
        }}
      >
        {secondaryNav.map(({ label, name, href, icon }) => (
          <RailButton
            key={name}
            label={label}
            icon={icon}
            active={activeName === name}
            onPress={() => go(href)}
          />
        ))}
      </View>

      <View style={{ padding: 8 }}>
        <AccountMenu
          name={displayName(me)}
          avatarUrl={me?.avatar_url}
          plan="Free plan"
          onNavigate={() => navigation.closeDrawer()}
        />
      </View>
    </Glass>
  );
}

function RailButton({
  label,
  icon: Icon,
  active,
  onPress,
}: {
  label: string;
  icon: IconComponent;
  active?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 40,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: active ? theme.fg(0.1) : pressed ? theme.fg(0.06) : "transparent",
      })}
    >
      <Icon size={18} color={active ? theme.colors.fg : theme.fg(0.6)} />
      <AppText size={13.5} color={active ? theme.colors.fg : theme.fg(0.6)} style={{ flex: 1 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function ChatGroup({
  label,
  entries,
  activeChatId,
  onOpen,
}: {
  label: string;
  entries: HistoryEntry[];
  activeChatId?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <AppText
        size={11}
        weight="semibold"
        tone={0.35}
        uppercase
        style={{ paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4, letterSpacing: 0.6 }}
      >
        {label}
      </AppText>
      <View style={{ gap: 2 }}>
        {entries.map((entry) => (
          <ChatRow
            key={entry.id}
            entry={entry}
            active={entry.id === activeChatId}
            onOpen={onOpen}
          />
        ))}
      </View>
    </View>
  );
}

// A tap opens the chat; a long press opens pin, rename and delete. That is
// the phone's version of the web's hover actions.
function ChatRow({
  entry,
  active,
  onOpen,
}: {
  entry: HistoryEntry;
  active: boolean;
  onOpen: (id: string) => void;
}) {
  const { theme } = useTheme();
  const router = useRouter();
  const update = useUpdateChat();
  const remove = useDeleteChat();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(entry.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function saveRename() {
    setRenaming(false);
    const title = draft.trim();
    if (title && title !== entry.title) update.mutate({ id: entry.id, title });
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityHint="Long press for more actions"
        onPress={() => onOpen(entry.id)}
        onLongPress={() => setMenuOpen(true)}
        delayLongPress={350}
        style={({ pressed }) => ({
          height: 40,
          justifyContent: "center",
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: active ? theme.fg(0.1) : pressed ? theme.fg(0.06) : "transparent",
        })}
      >
        <AppText size={13.5} color={active ? theme.colors.fg : theme.fg(0.65)} numberOfLines={1}>
          {entry.title}
        </AppText>
      </Pressable>

      <Menu open={menuOpen} onOpenChange={setMenuOpen} title={entry.title}>
        <MenuItem
          label={entry.pinned ? "Unpin" : "Pin"}
          icon={<AppText size={14}>{entry.pinned ? "★" : "☆"}</AppText>}
          onPress={() => {
            setMenuOpen(false);
            update.mutate({ id: entry.id, pinned: !entry.pinned });
          }}
        />
        <MenuItem
          label="Rename"
          icon={<PencilIcon size={16} color={theme.fg(0.8)} />}
          onPress={() => {
            setMenuOpen(false);
            setDraft(entry.title);
            setRenaming(true);
          }}
        />
        <MenuSeparator />
        <MenuItem
          label="Delete"
          tone="danger"
          icon={<TrashIcon size={16} color={theme.colors.down} />}
          onPress={() => {
            setMenuOpen(false);
            setConfirmDelete(true);
          }}
        />
      </Menu>

      <Modal
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename chat"
        footer={
          <>
            <Button variant="ghost" size="sm" label="Cancel" onPress={() => setRenaming(false)} />
            <Button size="sm" label="Save" onPress={saveRename} />
          </>
        }
      >
        <Field label="Name">
          <Input
            autoFocus
            value={draft}
            onChangeText={setDraft}
            returnKeyType="done"
            onSubmitEditing={saveRename}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title="Delete this chat?"
        description="The conversation and its files are removed. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate(entry.id, {
            onSuccess: () => {
              if (active) router.replace("/");
            },
          });
        }}
      />
    </>
  );
}
