import { Pressable, View } from "react-native";

import { Glass } from "@/components/ui/glass";
import { CheckIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { RADIUS } from "@/lib/theme";

interface SelectRowProps {
  title: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  // A radio dot instead of a check mark, for single-choice lists.
  radio?: boolean;
}

// One selectable glass row. Export formats, report reasons, spaces to file
// under, theme choices: they all read as this.
export function SelectRow({
  title,
  detail,
  selected,
  onPress,
  leading,
  trailing,
  radio = false,
}: SelectRowProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole={radio ? "radio" : "button"}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Glass
        tier="control"
        sheen
        active={selected}
        radius={RADIUS.input}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        {radio ? (
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: selected ? theme.colors.fg : theme.fg(0.3),
              backgroundColor: selected ? theme.colors.fg : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected ? (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: theme.colors.fgInvert,
                }}
              />
            ) : null}
          </View>
        ) : (
          leading
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size={13} weight="semibold">
            {title}
          </AppText>
          {detail ? (
            <AppText size={12} weight="regular" tone={0.5}>
              {detail}
            </AppText>
          ) : null}
        </View>
        {trailing}
        {!radio && selected ? <CheckIcon size={15} color={theme.colors.fg} /> : null}
      </Glass>
    </Pressable>
  );
}
