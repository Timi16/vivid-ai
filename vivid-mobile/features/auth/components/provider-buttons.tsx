import { Pressable } from "react-native";

import { Glass } from "@/components/ui/glass";
import { GoogleMark } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";

interface ProviderButtonProps {
  provider: "google";
  onPress?: () => void;
  disabled?: boolean;
}

const LABEL = {
  google: "Continue with Google",
};

export function ProviderButton({ provider, onPress, disabled }: ProviderButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={LABEL[provider]}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.8 : 1 })}
    >
      <Glass tier="control" sheen style={{ height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <GoogleMark size={17} />
        <AppText size={13.5} weight="semibold">
          {LABEL[provider]}
        </AppText>
      </Glass>
    </Pressable>
  );
}
