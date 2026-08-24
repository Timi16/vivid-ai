import { View } from "react-native";

import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { initials } from "@/lib/format";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, { box: number; text: number }> = {
  sm: { box: 28, text: 10 },
  md: { box: 36, text: 12 },
  lg: { box: 48, text: 15 },
};

// Initials only. There is no uploaded-image path yet, and a broken image is
// a worse fallback than a letter.
export function Avatar({ name, size = "md" }: { name: string; size?: Size }) {
  const { theme } = useTheme();
  const dims = SIZE[size];
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: dims.box,
        height: dims.box,
        borderRadius: dims.box / 2,
        backgroundColor: theme.fg(0.1),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText size={dims.text} weight="semibold" tone={0.8}>
        {initials(name)}
      </AppText>
    </View>
  );
}
