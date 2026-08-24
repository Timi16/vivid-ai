import { View } from "react-native";

import { AppText } from "@/components/ui/text";
import { useHealth } from "@/features/system/hooks/use-health";
import { useTheme } from "@/hooks/use-theme";

// Shows whether the FastAPI service is answering. Exercises the whole data
// path in one component: hook, backend client, network.
export function BackendStatus() {
  const { theme } = useTheme();
  const { data, isPending, isError } = useHealth();

  const state = isPending ? "checking" : isError ? "down" : data?.status === "ok" ? "up" : "down";

  const dot = { checking: theme.fg(0.3), up: theme.colors.up, down: theme.colors.down }[state];
  const label = { checking: "Checking backend", up: "Backend connected", down: "Backend unreachable" }[state];

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      <AppText size={12} weight="regular" tone={0.45}>
        {label}
      </AppText>
    </View>
  );
}
