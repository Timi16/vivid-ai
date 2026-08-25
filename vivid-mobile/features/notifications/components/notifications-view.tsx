import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { ArtifactsIcon, FlagIcon, SparkIcon, WaveformIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { groupByDay } from "@/features/notifications/lib/group";
import { useTheme } from "@/hooks/use-theme";
import { markAllActivityRead, useActivityFeed, type ActivityItem } from "@/lib/activity";
import { relativeTime } from "@/lib/format";

// Everything Vivid did this session, one row each, newest first. Opening the
// screen is what "reading" means, so everything is marked read on focus, and
// a row opens the thread it came from.
export function NotificationsView() {
  const router = useRouter();
  const items = useActivityFeed();
  const groups = groupByDay(items);
  const unread = items.filter((item) => item.unread).length;

  useFocusEffect(
    useCallback(() => {
      // Let the unread styling show for a beat before it clears.
      const timer = setTimeout(markAllActivityRead, 800);
      return () => clearTimeout(timer);
    }, [])
  );

  return (
    <View style={{ gap: 20 }}>
      <PageHeader
        title="Notifications"
        description="Replies, files and calls from this session."
        actions={
          unread > 0 ? (
            <Button variant="ghost" size="sm" label="Mark all read" onPress={markAllActivityRead} />
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <Glass tier="card" sheen blur={false} style={{ padding: 28, alignItems: "center", gap: 6 }}>
          <AppText size={14} weight="semibold" tone={0.85}>
            Nothing yet
          </AppText>
          <AppText size={12.5} weight="regular" tone={0.5} align="center">
            Replies, generated files and calls show up here as you use Vivid.
          </AppText>
        </Glass>
      ) : null}

      {groups.map((group) => (
        <View key={group.label} style={{ gap: 8 }}>
          <AppText
            size={11.5}
            weight="semibold"
            tone={0.4}
            uppercase
            style={{ letterSpacing: 0.6 }}
          >
            {group.label}
          </AppText>
          {group.items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onPress={
                item.chatId
                  ? () => router.push({ pathname: "/thread/[id]", params: { id: item.chatId! } })
                  : undefined
              }
            />
          ))}
        </View>
      ))}
      {items.length ? (
        <AppText size={11.5} weight="regular" tone={0.35} align="center">
          Kept for this session only.
        </AppText>
      ) : null}
    </View>
  );
}

const ICON: Record<
  ActivityItem["kind"],
  (props: { size?: number; color?: string }) => React.ReactNode
> = {
  reply: SparkIcon,
  file: ArtifactsIcon,
  call: WaveformIcon,
  error: FlagIcon,
};

function NotificationRow({ item, onPress }: { item: ActivityItem; onPress?: () => void }) {
  const { theme } = useTheme();
  const Icon = ICON[item.kind];
  const color = item.kind === "error" ? theme.colors.down : theme.fg(0.8);
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${item.title}. ${item.detail}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Glass
        tier="card"
        sheen
        blur={false}
        radius={16}
        active={item.unread}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.fg(0.1),
          }}
        >
          <Icon size={17} color={color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AppText size={13.5} weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
              {item.title}
            </AppText>
            <AppText size={11} weight="regular" tone={0.4}>
              {relativeTime(new Date(item.at))}
            </AppText>
            {item.unread ? (
              <View
                style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.fg }}
              />
            ) : null}
          </View>
          {item.detail ? (
            <AppText size={12.5} weight="regular" tone={0.55} numberOfLines={1}>
              {item.detail}
            </AppText>
          ) : null}
        </View>
      </Glass>
    </Pressable>
  );
}
