import { View } from "react-native";

import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  // Sits above the title. Used for the step counter during onboarding.
  eyebrow?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

// The frame every auth and onboarding step renders inside, so the wordmark,
// heading rhythm and card weight stay identical across the flow.
export function AuthCard({ title, subtitle, eyebrow, footer, children }: AuthCardProps) {
  return (
    <View style={{ width: "100%", maxWidth: 480, alignSelf: "center" }}>
      <View style={{ alignItems: "center", marginBottom: 28 }}>
        <AppText display size={26} lineHeight={28}>
          Vivid{" "}
          <AppText size={26} tone={0.45}>
            AI
          </AppText>
        </AppText>
      </View>

      <Glass tier="card" sheen style={{ padding: 28 }}>
        {eyebrow ? <View style={{ marginBottom: 12 }}>{eyebrow}</View> : null}
        <AppText display size={21} lineHeight={26}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText size={13.5} weight="regular" tone={0.55} lineHeight={20} style={{ marginTop: 8 }}>
            {subtitle}
          </AppText>
        ) : null}
        <View style={{ marginTop: 24 }}>{children}</View>
      </Glass>

      {footer ? <View style={{ marginTop: 20, alignItems: "center" }}>{footer}</View> : null}
    </View>
  );
}
