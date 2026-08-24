import { Pressable, View } from "react-native";

import { Glass } from "@/components/ui/glass";
import { useTheme } from "@/hooks/use-theme";

interface IconButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  // "ghost" carries the material only while pressed; "control" always;
  // "bright" is the primary action.
  variant?: "ghost" | "control" | "bright";
  size?: number;
  children: React.ReactNode;
}

// A square-ish tap target around one icon. The size is the touch target, not
// the glyph.
export function IconButton({
  label,
  onPress,
  disabled,
  variant = "ghost",
  size = 36,
  children,
}: IconButtonProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.75 : 1 })}
    >
      {variant === "ghost" ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.fg(0.0),
          }}
        >
          {children}
        </View>
      ) : (
        <Glass
          tier={variant}
          sheen
          radius={size / 2}
          style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
        >
          {children}
        </Glass>
      )}
    </Pressable>
  );
}
