import { Platform, View } from "react-native";

import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import { SettingGroup } from "@/features/settings/components/setting-row";
import { SHORTCUT_GROUPS } from "@/features/settings/lib/data";
import { useTheme } from "@/hooks/use-theme";

function Key({ label }: { label: string }) {
  return (
    <Glass
      tier="control"
      radius={7}
      style={{ height: 24, minWidth: 24, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}
    >
      <AppText size={11} weight="semibold" tone={0.8}>
        {label}
      </AppText>
    </Glass>
  );
}

// The shortcuts a hardware keyboard (an iPad or an Android tablet with one)
// can use. The modifier label follows the platform.
export function ShortcutsPanel() {
  const { theme } = useTheme();
  const mod = Platform.OS === "ios" ? "⌘" : "Ctrl";

  return (
    <View style={{ gap: 24 }}>
      {SHORTCUT_GROUPS.map((group) => (
        <SettingGroup key={group.title} title={group.title}>
          {group.shortcuts.map((shortcut, index) => (
            <View
              key={shortcut.action}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.fg(0.08),
              }}
            >
              <AppText size={13} tone={0.85}>
                {shortcut.action}
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {shortcut.keys.map((key) => (
                  <Key key={key} label={key === "Mod" ? mod : key} />
                ))}
              </View>
            </View>
          ))}
        </SettingGroup>
      ))}
    </View>
  );
}
