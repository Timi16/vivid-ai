import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { NOTIFICATION_SETTINGS } from "@/features/settings/lib/data";
import { SettingGroup, SettingRow } from "@/features/settings/components/setting-row";

export function NotificationsPanel() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIFICATION_SETTINGS.map((s) => [s.id, s.defaultOn]))
  );

  return (
    <SettingGroup title="Send me a notification when">
      {NOTIFICATION_SETTINGS.map((setting) => (
        <SettingRow
          key={setting.id}
          label={setting.label}
          detail={setting.detail}
          control={
            <Switch
              checked={enabled[setting.id] ?? setting.defaultOn}
              onCheckedChange={(next) => setEnabled((prev) => ({ ...prev, [setting.id]: next }))}
              accessibilityLabel={setting.label}
            />
          }
        />
      ))}
    </SettingGroup>
  );
}
