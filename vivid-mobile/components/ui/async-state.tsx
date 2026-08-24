import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { NETWORK_ERROR_MESSAGE } from "@/lib/backend/client";

// Shared async states for any screen backed by the API. Real data means real
// failure modes, so every screen shows one of these rather than an empty
// shell that looks like a working page with nothing in it.

export function AsyncLoading({ rows = 3 }: { label?: string; rows?: number }) {
  const { theme } = useTheme();
  return (
    <View accessibilityRole="progressbar" style={{ gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ height: 52, borderRadius: 14, backgroundColor: theme.fg(0.06) }} />
      ))}
    </View>
  );
}

export function AsyncEmpty({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ alignItems: "center", paddingHorizontal: 16, paddingVertical: 56 }}>
      <AppText size={13} weight="regular" tone={0.45} align="center">
        {children}
      </AppText>
    </View>
  );
}

interface AsyncErrorProps {
  error: unknown;
  // What the user was trying to see, e.g. "your history".
  subject: string;
  // Shown when the backend cannot be reached at all.
  unreachableDetail?: string;
  onRetry?: () => void;
}

// One error surface per feature. A backend that is not running reads as
// "not available", not as a fault the user can retry away.
export function AsyncError({ error, subject, unreachableDetail, onRetry }: AsyncErrorProps) {
  const message = (error as Error | null)?.message ?? "Something went wrong on our side.";
  const unreachable = message === NETWORK_ERROR_MESSAGE;
  return (
    <Glass
      tier="card"
      sheen
      style={{ alignItems: "center", paddingHorizontal: 20, paddingVertical: 48 }}
    >
      <View style={{ maxWidth: 340, alignItems: "center", gap: 6 }}>
        <AppText size={14} weight="semibold" tone={0.85} align="center">
          {unreachable ? `${subject} isn't available right now.` : `Couldn't load ${subject}.`}
        </AppText>
        <AppText size={12.5} weight="regular" tone={0.5} align="center">
          {unreachable ? (unreachableDetail ?? message) : message}
        </AppText>
        {onRetry ? (
          <Button
            variant="secondary"
            size="sm"
            label="Try again"
            onPress={onRetry}
            style={{ marginTop: 12 }}
          />
        ) : null}
      </View>
    </Glass>
  );
}
