import { Switch as NativeSwitch } from "react-native";

import { useTheme } from "@/hooks/use-theme";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function Switch({ checked, onCheckedChange, disabled, accessibilityLabel }: SwitchProps) {
  const { theme } = useTheme();
  return (
    <NativeSwitch
      value={checked}
      onValueChange={onCheckedChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: theme.fg(0.15), true: theme.fg(0.85) }}
      thumbColor={checked ? theme.colors.fgInvert : theme.colors.fg}
      ios_backgroundColor={theme.fg(0.15)}
    />
  );
}
