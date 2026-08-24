import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { ComputerIcon, MoonIcon, SunIcon, type IconComponent } from "@/components/ui/icons";
import { SelectRow } from "@/components/ui/select-row";
import { useTheme } from "@/hooks/use-theme";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import { SettingGroup, SettingRow } from "@/features/settings/components/setting-row";

const ICON: Record<ThemePreference, IconComponent> = {
  system: ComputerIcon,
  dark: MoonIcon,
  light: SunIcon,
};

export function AppearancePanel() {
  const { theme, preference, setPreference } = useTheme();

  return (
    <View style={{ gap: 24 }}>
      <SettingGroup title="Theme">
        <View style={{ gap: 10, padding: 16 }}>
          {THEME_OPTIONS.map((option) => {
            const Icon = ICON[option.value];
            const on = preference === option.value;
            return (
              <SelectRow
                key={option.value}
                radio
                title={option.label}
                detail={option.detail}
                selected={on}
                onPress={() => setPreference(option.value)}
                trailing={<Icon size={16} color={on ? theme.colors.fg : theme.fg(0.45)} />}
              />
            );
          })}
        </View>
      </SettingGroup>

      <SettingGroup title="Display">
        <SettingRow
          label="Reduce transparency"
          detail="Vivid already follows your system setting for this. Turn it on there to swap the glass for solid panels."
          control={<Button variant="secondary" size="sm" label="System" disabled />}
        />
        <SettingRow
          label="Reduce motion"
          detail="Also read from your system setting. Transitions are shortened when it is on."
          control={<Button variant="secondary" size="sm" label="System" disabled />}
        />
      </SettingGroup>
    </View>
  );
}
