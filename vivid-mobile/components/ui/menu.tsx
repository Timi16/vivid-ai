import { Modal as NativeModal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/ui/glass";
import { CheckIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { RADIUS } from "@/lib/theme";

interface MenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
}

// On the web a menu pops up next to its trigger. On a phone the same list
// rises from the bottom as a sheet, which is what people's thumbs expect.
// The caller owns the open state, so any control can be the trigger.
export function Menu({ open, onOpenChange, title, children }: MenuProps) {
  const insets = useSafeAreaInsets();
  return (
    <NativeModal
      visible={open}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => onOpenChange(false)}
    >
      <Pressable
        accessibilityLabel="Close menu"
        onPress={() => onOpenChange(false)}
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]}
      />
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: "flex-end", padding: 12 }}>
        <Glass tier="sheet" sheen radius={RADIUS.sheet} style={{ paddingVertical: 8, paddingHorizontal: 6, marginBottom: insets.bottom, maxHeight: "70%" }}>
          {title ? <MenuLabel>{title}</MenuLabel> : null}
          <ScrollView bounces={false}>{children}</ScrollView>
        </Glass>
      </View>
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

export function MenuItem({ label, icon, tone = "default", disabled, selected, onPress }: MenuItemProps) {
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
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.fg(0.12), marginVertical: 6, marginHorizontal: 8 }} />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <AppText size={11} weight="semibold" tone={0.35} uppercase style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4, letterSpacing: 0.6 }}>
      {children}
    </AppText>
  );
}
