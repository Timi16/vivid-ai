import { View, type StyleProp, type ViewStyle } from "react-native";

import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

interface SettingRowProps {
  label: string;
  detail?: string;
  // The control on the right: a switch, a button, a value.
  control?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// One row of a settings group. Kept as a component so every row lines up and
// the label and its control stay associated.
export function SettingRow({ label, detail, control, style }: SettingRowProps) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size={13.5} weight="semibold">
          {label}
        </AppText>
        {detail ? (
          <AppText size={12} weight="regular" tone={0.5} lineHeight={18}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {control ? <View style={{ flexShrink: 0 }}>{control}</View> : null}
    </View>
  );
}

interface SettingGroupProps {
  title?: string;
  children: React.ReactNode;
}

// A titled glass card whose children are separated by hairlines, the web's
// divide-y. The divider is drawn between siblings here since RN has no
// sibling selector.
export function SettingGroup({ title, children }: SettingGroupProps) {
  const { theme } = useTheme();
  const rows = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <View style={{ gap: 10 }}>
      {title ? (
        <AppText size={11.5} weight="semibold" tone={0.4} uppercase style={{ letterSpacing: 0.6 }}>
          {title}
        </AppText>
      ) : null}
      <Glass tier="card" sheen blur={false} style={{ overflow: "hidden" }}>
        {rows.map((row, index) => (
          <View
            key={index}
            style={index > 0 ? { borderTopWidth: 1, borderTopColor: theme.fg(0.08) } : undefined}
          >
            {row}
          </View>
        ))}
      </Glass>
    </View>
  );
}
