import { useRouter } from "expo-router";
import type { DrawerHeaderProps } from "expo-router/drawer";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { topicNav } from "@/components/layout/nav-items";
import { NotificationsButton } from "@/components/layout/notifications-button";
import { setSearchOpen } from "@/components/layout/search-state";
import { IconButton } from "@/components/ui/icon-button";
import { ArrowLeftIcon, SearchIcon, SidebarIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

// The header for every screen behind the drawer: back (whenever there is
// somewhere to go back to), the drawer toggle, the topic strip (preview
// only), search, and notifications. Home has nothing behind it, so it shows
// the menu button alone.

export function Topbar({ navigation, route, options }: DrawerHeaderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The chat screen and a thread are one surface: the first message replaces
  // the route in place, so a back arrow there offers to undo something the
  // person never did. You leave a conversation through the drawer, the way
  // every phone chat app works. Everywhere else keeps a back arrow whenever
  // there is genuinely something behind it.
  const onChatSurface = route.name === "index" || route.name === "thread/[id]";
  const canGoBack = !onChatSurface && router.canGoBack();
  const params = route.params as { topic?: string } | undefined;
  const activeTopic = route.name === "discover" ? (params?.topic ?? "discover") : null;

  return (
    <View
      style={{
        paddingTop: insets.top,
        height: insets.top + 56,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        gap: 4,
        borderBottomWidth: 1,
        borderBottomColor: theme.fg(0.08),
      }}
    >
      {canGoBack ? (
        <IconButton label="Back" onPress={() => router.back()}>
          <ArrowLeftIcon size={20} color={theme.fg(0.7)} />
        </IconButton>
      ) : null}
      <IconButton label="Open menu" onPress={() => navigation.toggleDrawer()}>
        <SidebarIcon size={18} color={theme.fg(0.7)} />
      </IconButton>

      {topicNav.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: "center", gap: 18, paddingHorizontal: 10 }}
        >
          {topicNav.map((item) => {
            const active = activeTopic === item.topic;
            return (
              <Pressable
                key={item.topic}
                accessibilityRole="link"
                onPress={() =>
                  router.push({ pathname: "/discover", params: { topic: item.topic } })
                }
              >
                <AppText size={13} color={active ? theme.colors.fg : theme.fg(0.55)}>
                  {item.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        // Where the topic strip would be. The screen's own title sits here so
        // you can always see where you are, and on the chat screen that title
        // is the product name.
        <View style={{ flex: 1, paddingHorizontal: 8 }}>
          <AppText size={16} numberOfLines={1}>
            {options.title ?? ""}
          </AppText>
        </View>
      )}

      <IconButton label="Search" onPress={() => setSearchOpen(true)}>
        <SearchIcon size={17} color={theme.fg(0.6)} />
      </IconButton>
      <NotificationsButton />
    </View>
  );
}
