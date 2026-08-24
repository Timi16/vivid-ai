import { Pressable, type AccessibilityRole } from "react-native";

import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

interface ChipProps {
  label: string;
  selected?: boolean;
  icon?: React.ReactNode;
  onPress?: () => void;
  accessibilityRole?: AccessibilityRole;
  size?: "sm" | "md";
}

// A glass pill: starter prompts, interest picks, filter tabs, feedback tags.
export function Chip({ label, selected = false, icon, onPress, accessibilityRole = "button", size = "md" }: ChipProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <Glass
        tier="control"
        sheen
        active={selected}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: size === "sm" ? 12 : 14,
          paddingVertical: size === "sm" ? 6 : 8,
        }}
      >
        {icon}
        <AppText size={12.5} color={selected ? theme.colors.fg : theme.fg(0.72)}>
          {label}
        </AppText>
      </Glass>
    </Pressable>
  );
}
