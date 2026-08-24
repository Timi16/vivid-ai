import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountMenu } from "@/components/layout/account-menu";
import { drawerNav } from "@/components/layout/nav-items";
import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { useAuthTokens } from "@/lib/backend/client";

// The sidebar, as a drawer. Same items, same order as the web rail.
export function DrawerContent({ state, navigation }: DrawerContentComponentProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tokens = useAuthTokens();
  const activeName = state.routes[state.index]?.name;

  return (
    <Glass
      tier="base"
      radius={0}
      style={{ flex: 1, borderWidth: 0, borderRightWidth: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View style={{ height: 56, justifyContent: "center", paddingHorizontal: 20 }}>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            navigation.closeDrawer();
            router.push("/");
          }}
        >
          <AppText display size={17}>
            Vivid
          </AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 8, gap: 2 }}>
        {drawerNav.map(({ label, name, href, icon: Icon }) => {
          const active = activeName === name;
          return (
            <Pressable
              key={name}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              onPress={() => {
                navigation.closeDrawer();
                router.push(href);
              }}
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
              <AppText size={13.5} color={active ? theme.colors.fg : theme.fg(0.6)}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: theme.fg(0.08), padding: 8 }}>
        <AccountMenu
          name={tokens?.user?.email?.split("@")[0] ?? "Guest"}
          plan="Free plan"
          onNavigate={() => navigation.closeDrawer()}
        />
      </View>
    </Glass>
  );
}
