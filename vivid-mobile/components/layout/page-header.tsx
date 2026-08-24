import { View } from "react-native";

import { AppText } from "@/components/ui/text";

interface PageHeaderProps {
  title: string;
  description?: string;
  // Buttons aligned to the right of the title.
  actions?: React.ReactNode;
}

// The title block every inner page uses, so headings keep one rhythm.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText display size={24} lineHeight={28}>
          {title}
        </AppText>
        {description ? (
          <AppText size={13} weight="regular" tone={0.5}>
            {description}
          </AppText>
        ) : null}
      </View>
      {actions ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{actions}</View> : null}
    </View>
  );
}
