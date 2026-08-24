import { Text, type TextProps, type TextStyle } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { FONT } from "@/lib/theme";

type Weight = "regular" | "medium" | "semibold" | "bold";

export interface AppTextProps extends TextProps {
  size?: number;
  weight?: Weight;
  // Foreground opacity, the web's text-fg/55. Ignored when `color` is set.
  tone?: number;
  color?: string;
  // The display face: headings and the wordmark. Bold, tight tracking.
  display?: boolean;
  align?: TextStyle["textAlign"];
  lineHeight?: number;
  mono?: boolean;
  uppercase?: boolean;
}

// The one text primitive. Body copy defaults to medium weight at 14px,
// matching the web's base typography, so a bare <AppText> already reads right.
export function AppText({
  size = 14,
  weight = "medium",
  tone = 1,
  color,
  display = false,
  align,
  lineHeight,
  mono = false,
  uppercase = false,
  style,
  ...props
}: AppTextProps) {
  const { theme } = useTheme();
  const resolvedColor = color ?? (tone >= 1 ? theme.colors.fg : theme.fg(tone));
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: mono ? undefined : display ? FONT.bold : FONT[weight],
          fontSize: size,
          color: resolvedColor,
          textAlign: align,
          lineHeight,
          letterSpacing: display ? -0.01 * size : undefined,
          textTransform: uppercase ? "uppercase" : undefined,
        },
        mono && { fontFamily: "Menlo", fontVariant: ["tabular-nums"] },
        style,
      ]}
    />
  );
}
