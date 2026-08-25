import {
  Modal as NativeModal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/ui/glass";
import { CheckIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { RADIUS } from "@/lib/theme";

// Where the trigger sits on screen, from measureInWindow. With an anchor the
// menu hangs from its trigger like the web popover; without one it rises
// from the bottom as a sheet.
export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  anchor?: MenuAnchor | null;
  // Popover width; the sheet always spans the screen.
  width?: number;
  children: React.ReactNode;
}

const POPOVER_GAP = 6;
const SCREEN_GUTTER = 12;

// The caller owns the open state, so any control can be the trigger. Action
// lists that belong to a message or a row rise as a bottom sheet, where a
// thumb expects them. Anything opened from the header (notifications) is
// anchored under its button, because a panel appearing at the bottom of the
// screen for a tap at the top reads as unrelated to what was pressed.
export function Menu({ open, onOpenChange, title, anchor, width = 320, children }: MenuProps) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const popover = Boolean(anchor);

  const panel = (
    <Glass
      tier="sheet"
      sheen
      radius={RADIUS.sheet}
      style={
        popover
          ? { paddingVertical: 8, paddingHorizontal: 6 }
          : {
              paddingVertical: 8,
              paddingHorizontal: 6,
              marginBottom: insets.bottom,
              maxHeight: "70%",
            }
      }
    >
      {title ? <MenuLabel>{title}</MenuLabel> : null}
      <ScrollView bounces={false}>{children}</ScrollView>
    </Glass>
  );

  let placement: React.ReactNode;
  if (anchor) {
    // Right-aligned to the trigger, kept inside the screen gutters, and never
    // taller than the space below it.
    const top = anchor.y + anchor.height + POPOVER_GAP;
    const panelWidth = Math.min(width, window.width - SCREEN_GUTTER * 2);
    const right = Math.max(SCREEN_GUTTER, window.width - (anchor.x + anchor.width));
    const maxHeight = window.height - top - insets.bottom - SCREEN_GUTTER;
    placement = (
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", top, right, width: panelWidth, maxHeight }}
      >
        {panel}
      </View>
    );
  } else {
    placement = (
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: "flex-end", padding: 12 }}>
        {panel}
      </View>
    );
  }

  return (
    <NativeModal
      visible={open}
      transparent
      animationType={popover ? "fade" : "slide"}
      statusBarTranslucent
      onRequestClose={() => onOpenChange(false)}
    >
      <Pressable
        accessibilityLabel="Close menu"
        onPress={() => onOpenChange(false)}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: popover ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.55)" },
        ]}
      />
      {placement}
    </NativeModal>
  );
}

interface MenuItemProps {
  label: string;
  icon?: React.ReactNode;
  // Destructive rows read red and sit below a separator.
  tone?: "default" | "danger";
  disabled?: boolean;
  selected?: boolean;
  onPress?: () => void;
}

export function MenuItem({
  label,
  icon,
  tone = "default",
  disabled,
  selected,
  onPress,
}: MenuItemProps) {
  const { theme } = useTheme();
  const color = tone === "danger" ? theme.colors.down : theme.fg(0.85);
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: RADIUS.menuItem,
        opacity: disabled ? 0.4 : 1,
        backgroundColor: pressed ? theme.fg(0.1) : "transparent",
      })}
    >
      {icon ? <View style={{ width: 18, alignItems: "center" }}>{icon}</View> : null}
      <AppText size={14} color={color} style={{ flex: 1 }}>
        {label}
      </AppText>
      {selected ? <CheckIcon size={15} color={theme.colors.fg} /> : null}
    </Pressable>
  );
}

export function MenuSeparator() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.fg(0.12),
        marginVertical: 6,
        marginHorizontal: 8,
      }}
    />
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <AppText
      size={11}
      weight="semibold"
      tone={0.35}
      uppercase
      style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4, letterSpacing: 0.6 }}
    >
      {children}
    </AppText>
  );
}
