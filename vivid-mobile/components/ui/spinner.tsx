import { ActivityIndicator } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export function Spinner({
  size = "small",
  tone = 0.7,
}: {
  size?: "small" | "large";
  tone?: number;
}) {
  const { theme } = useTheme();
  return <ActivityIndicator size={size} color={theme.fg(tone)} />;
}
