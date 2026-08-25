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

// The header for every screen behind the drawer: the drawer toggle, the
// topic strip (preview only), search, and notifications. A thread keeps the
// same header: it lives inside the shell, like the web, so there is no back
// arrow that would take the reader out of a conversation they just started.
const SECONDARY_ROUTES = new Set(["notifications", "upgrade"]);

export function Topbar({ navigation, route }: DrawerHeaderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Pages you are sent to rather than live in (notifications) get a back
  // arrow. The thread and the main pages keep the drawer button.
  const secondary = SECONDARY_ROUTES.has(route.name);
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
      {secondary && router.canGoBack() ? (
        <IconButton label="Back" onPress={() => router.back()}>
          <ArrowLeftIcon size={20} color={theme.fg(0.7)} />
        </IconButton>
      ) : (
        <IconButton label="Open menu" onPress={() => navigation.toggleDrawer()}>
          <SidebarIcon size={18} color={theme.fg(0.7)} />
        </IconButton>
      )}

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
