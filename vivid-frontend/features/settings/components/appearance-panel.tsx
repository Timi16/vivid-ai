"use client";

import { Button } from "@/components/ui/button";
import { CheckIcon, ComputerIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import { SettingGroup, SettingRow } from "@/features/settings/components/setting-row";

const ICON: Record<ThemePreference, (props: { size?: number }) => React.ReactNode> = {
  system: ComputerIcon,
  dark: MoonIcon,
  light: SunIcon,
};

export function AppearancePanel() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup title="Theme">
        <div className="grid gap-2.5 p-4 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = ICON[option.value];
            const on = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                onClick={() => setPreference(option.value)}
                className={cn(
                  "vd-glass-control vd-sheen flex cursor-pointer flex-col gap-2 rounded-[16px] p-4 text-left",
                  "hover:border-fg/28 transition-colors",
                  on && "border-fg/45 bg-fg/14"
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon size={16} />
                  <span className="text-fg text-[13px] font-semibold">{option.label}</span>
                  {on ? <CheckIcon size={14} className="text-fg ml-auto" /> : null}
                </span>
                <span className="text-fg/50 text-[11.5px] leading-relaxed font-normal">
                  {option.detail}
                </span>
              </button>
            );
          })}
        </div>
      </SettingGroup>

      <SettingGroup title="Display">
        <SettingRow
          label="Reduce transparency"
          detail="Vivid already follows your system setting for this. Turn it on there to swap the glass for solid panels."
          control={
            <Button variant="secondary" size="sm" disabled>
              System
            </Button>
          }
        />
        <SettingRow
          label="Reduce motion"
          detail="Also read from your system setting. Transitions are shortened when it is on."
          control={
            <Button variant="secondary" size="sm" disabled>
              System
            </Button>
          }
        />
      </SettingGroup>
    </div>
  );
}
