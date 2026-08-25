import { useRouter } from "expo-router";
import { View } from "react-native";

import { IconButton } from "@/components/ui/icon-button";
import { BellIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { useActivityFeed } from "@/lib/activity";

// The bell in the header: a link to the notifications screen, with the
// unread count on it. On a phone a list belongs on a screen of its own, not
// in a popover hanging off a 40pt button.
export function NotificationsButton() {
  const { theme } = useTheme();
  const router = useRouter();
  const unread = useActivityFeed().filter((item) => item.unread).length;

  return (
    <View>
      <IconButton
        label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onPress={() => router.push("/notifications")}
      >
        <BellIcon size={18} color={theme.fg(0.6)} />
      </IconButton>
      {unread > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.fg,
            borderWidth: 2,
            borderColor: theme.colors.page,
          }}
        >
          <AppText size={9.5} weight="bold" color={theme.colors.fgInvert} lineHeight={12}>
            {unread > 9 ? "9+" : String(unread)}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
