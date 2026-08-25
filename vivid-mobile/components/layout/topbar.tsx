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

export function Topbar({ navigation, route }: DrawerHeaderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const canGoBack = route.name !== "index" && router.canGoBack();
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
        <View style={{ flex: 1 }} />
      )}

      <IconButton label="Search" onPress={() => setSearchOpen(true)}>
        <SearchIcon size={17} color={theme.fg(0.6)} />
      </IconButton>
      <NotificationsButton />
    </View>
  );
}
