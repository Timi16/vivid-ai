import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BellIcon } from "@/components/ui/icons";
import { Menu, MenuLabel } from "@/components/ui/menu";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { markAllActivityRead, useActivityFeed } from "@/lib/activity";
import { relativeTime } from "@/lib/format";

export function NotificationsMenu() {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  // The live in-app activity feed: replies, created files, calls, failures.
  const items = useActivityFeed();
  const unread = items.filter((item) => item.unread).length;

  return (
    <>
      <View>
        <IconButton label={unread ? `Notifications, ${unread} unread` : "Notifications"} onPress={() => setOpen(true)}>
          <BellIcon size={18} color={theme.fg(0.6)} />
        </IconButton>
        {unread > 0 ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.colors.fg,
              borderWidth: 2,
              borderColor: theme.colors.page,
            }}
          />
        ) : null}
      </View>

      <Menu open={open} onOpenChange={setOpen}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: 6 }}>
          <MenuLabel>Notifications</MenuLabel>
          {unread > 0 ? <Button variant="ghost" size="sm" label="Mark all read" onPress={markAllActivityRead} /> : null}
        </View>
        <View style={{ gap: 4, paddingHorizontal: 4, paddingBottom: 6 }}>
          {items.length === 0 ? (
            <AppText size={12.5} weight="regular" tone={0.4} style={{ paddingHorizontal: 8, paddingVertical: 12 }}>
              Nothing yet. Replies, generated files and calls show up here.
            </AppText>
          ) : null}
          {items.map((item) => (
            <View
              key={item.id}
              style={{ gap: 2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: item.unread ? theme.fg(0.06) : "transparent" }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AppText size={12.5} weight="semibold" tone={0.9} numberOfLines={1} style={{ flex: 1 }}>
                  {item.title}
                </AppText>
                <AppText size={10.5} weight="regular" tone={0.35}>
                  {relativeTime(new Date(item.at))}
                </AppText>
                {item.unread ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.fg(0.7) }} /> : null}
              </View>
              <AppText size={11.5} weight="regular" tone={0.5}>
                {item.detail}
              </AppText>
            </View>
          ))}
        </View>
      </Menu>
    </>
  );
}
