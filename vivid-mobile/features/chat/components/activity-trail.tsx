import { View } from "react-native";

import { Glass } from "@/components/ui/glass";
import { CheckIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

// The live tool/step trail while a turn runs: each step the backend takes
// (searching, browsing, running code) lands here as it happens, with a
// spinner on the current one.
export function ActivityTrail({ steps, busy }: { steps: string[]; busy: boolean }) {
  const { theme } = useTheme();
  if (!steps.length) return null;
  return (
    <Glass
      tier="card"
      blur={false}
      style={{ alignSelf: "flex-start", gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}
    >
      {steps.map((step, index) => {
        const isLive = index === steps.length - 1 && busy;
        return (
          <View
            key={`${index}-${step}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            {isLive ? <Spinner /> : <CheckIcon size={14} color={theme.fg(0.45)} />}
            <AppText size={13} tone={0.7} style={{ flexShrink: 1 }}>
              {step}
            </AppText>
          </View>
        );
      })}
    </Glass>
  );
}
