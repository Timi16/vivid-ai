import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/ui/glass";
import { BellIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { useActivityFeed } from "@/lib/activity";

const SHOW_MS = 4500;

// The "glance" case: a reply lands while you are on another screen, and a
// small banner slides in under the header for a few seconds. It never shows
// for the thread you are already looking at, since that thread shows the
// reply itself.
export function ActivityBanner() {
  const { theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const items = useActivityFeed();
  // The newest item already handled: dismissed, expired, or on screen when
  // the banner mounted. Everything newer than it is a candidate.
  const [handledId, setHandledId] = useState<string | null>(() => items[0]?.id ?? null);
  const slide = useRef(new Animated.Value(-120)).current;

  const latest = items[0] ?? null;
  const pending = latest && latest.id !== handledId ? latest : null;
  const onThatThread = Boolean(pending?.chatId && pathname === `/thread/${pending.chatId}`);
  // Shown only when the person is somewhere else: the thread itself already
  // shows the reply.
  const current = pending && !onThatThread ? pending : null;

  useEffect(() => {
    if (!pending || !onThatThread) return;
    const timer = setTimeout(() => setHandledId(pending.id), 0);
    return () => clearTimeout(timer);
  }, [pending, onThatThread]);

  useEffect(() => {
    if (!current) return;
    slide.setValue(-120);
    Animated.spring(slide, {
      toValue: 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
    }).start();
    const timer = setTimeout(() => dismiss(current.id), SHOW_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  function dismiss(id: string) {
    Animated.timing(slide, { toValue: -120, duration: 180, useNativeDriver: true }).start(() =>
      setHandledId(id)
    );
  }

  function open() {
    if (!current) return;
    const item = current;
    dismiss(item.id);
    if (item.chatId) router.push({ pathname: "/thread/[id]", params: { id: item.chatId } });
    else router.push("/notifications");
  }

  if (!current) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 60,
        left: 12,
        right: 12,
        transform: [{ translateY: slide }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${current.title}. Open`}
        onPress={open}
      >
        <Glass
          tier="sheet"
          sheen
          radius={16}
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
              width: 32,
              height: 32,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.fg(0.1),
            }}
          >
            <BellIcon
              size={16}
              color={current.kind === "error" ? theme.colors.down : theme.fg(0.85)}
            />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <AppText size={13} weight="semibold" numberOfLines={1}>
              {current.title}
            </AppText>
            <AppText size={12} weight="regular" tone={0.55} numberOfLines={1}>
              {current.detail || "Tap to open"}
            </AppText>
          </View>
          <AppText size={12} weight="semibold" tone={0.7}>
            Open
          </AppText>
        </Glass>
      </Pressable>
    </Animated.View>
  );
}
