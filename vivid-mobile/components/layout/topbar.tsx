import type { DrawerHeaderProps } from "@react-navigation/drawer";
import { DrawerActions } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { topicNav } from "@/components/layout/nav-items";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { IconButton } from "@/components/ui/icon-button";
import { ArrowLeftIcon, MenuIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

// The header for every screen behind the drawer: the drawer toggle, the
// topic strip, and notifications. A pushed screen (a thread) gets a back
// arrow instead of the hamburger.
export function Topbar({ navigation, route }: DrawerHeaderProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const nested = route.name.startsWith("thread/");
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
      {nested && router.canGoBack() ? (
        <IconButton label="Back" onPress={() => router.back()}>
          <ArrowLeftIcon size={20} color={theme.fg(0.7)} />
        </IconButton>
      ) : (
        <IconButton label="Open menu" onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}>
          <MenuIcon size={20} color={theme.fg(0.7)} />
        </IconButton>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", gap: 18, paddingHorizontal: 10 }}>
        {topicNav.map((item) => {
          const active = activeTopic === item.topic;
          return (
            <Pressable
              key={item.topic}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: "/discover", params: { topic: item.topic } })}
            >
              <AppText size={13} color={active ? theme.colors.fg : theme.fg(0.55)}>
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <NotificationsMenu />
    </View>
  );
}
