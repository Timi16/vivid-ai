import { Pressable } from "react-native";

import { Glass } from "@/components/ui/glass";
import { GoogleMark, KingsChatMark } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";

interface ProviderButtonProps {
  provider: "google" | "kingschat";
  onPress?: () => void;
  disabled?: boolean;
  // Renders the button as an announced-but-unbuilt option: still pressable,
  // so the tap can explain itself, but visibly not ready.
  comingSoon?: boolean;
}

const LABEL = {
  google: "Continue with Google",
  kingschat: "Continue with KingsChat",
};

const MARK = {
  google: GoogleMark,
  kingschat: KingsChatMark,
};

export function ProviderButton({
  provider,
  onPress,
  disabled,
  comingSoon,
}: ProviderButtonProps) {
  const Mark = MARK[provider];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={LABEL[provider]}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.8 : 1 })}
    >
      <Glass
        tier="control"
        sheen
        style={{
          height: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <Mark size={17} />
        <AppText size={13.5} weight="semibold">
          {LABEL[provider]}
        </AppText>
      </Glass>
    </Pressable>
  );
}
