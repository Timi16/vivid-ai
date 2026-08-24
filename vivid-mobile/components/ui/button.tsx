import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import type { GlassTier } from "@/lib/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  icon?: React.ReactNode;
  // Shows the spinner and blocks interaction. The label stays in place so the
  // button does not change width mid-action.
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 32, md: 40, lg: 48, icon: 40, "icon-sm": 32 };
const PADDING: Record<ButtonSize, number> = { sm: 12, md: 16, lg: 24, icon: 0, "icon-sm": 0 };
const TEXT: Record<ButtonSize, number> = {
  sm: 12.5,
  md: 13.5,
  lg: 15,
  icon: 13.5,
  "icon-sm": 12.5,
};

// Every variant is the same glass at a different brightness. Hierarchy comes
// from how much light the surface carries, not from one being flat.
export function Button({
  variant = "primary",
  size = "md",
  label,
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  onPress,
  style,
  children,
}: ButtonProps) {
  const { theme } = useTheme();
  const blocked = disabled || loading;
  const isIcon = size === "icon" || size === "icon-sm";

  const tier: GlassTier | null =
    variant === "primary" ? "bright" : variant === "ghost" ? null : "control";
  const textColor =
    variant === "primary"
      ? theme.colors.ink
      : variant === "danger"
        ? "#ffb4b4"
        : variant === "ghost"
          ? theme.fg(0.65)
          : theme.colors.fg;

  const content = (
    <View
      style={{
        height: HEIGHT[size] - 2,
        minWidth: isIcon ? HEIGHT[size] - 2 : undefined,
        paddingHorizontal: PADDING[size],
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: size === "sm" ? 6 : 8,
      }}
    >
      {loading ? <ActivityIndicator size="small" color={textColor} /> : icon}
      {label ? (
        <AppText size={TEXT[size]} weight="semibold" color={textColor} numberOfLines={1}>
          {label}
        </AppText>
      ) : null}
      {children}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        {
          opacity: blocked ? 0.45 : pressed ? 0.8 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {tier ? (
        <Glass
          tier={tier}
          sheen
          style={[
            variant === "danger" && {
              borderColor: "rgba(239,68,68,0.45)",
              backgroundColor: "rgba(239,68,68,0.22)",
            },
            variant === "outline" && { borderColor: theme.fg(0.22) },
          ]}
        >
          {content}
        </Glass>
      ) : (
        <View style={{ borderRadius: 999, borderWidth: 1, borderColor: "transparent" }}>
          {content}
        </View>
      )}
    </Pressable>
  );
}
