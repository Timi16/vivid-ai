import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import { dismissToast, useToasts } from "@/lib/toast";
import { RADIUS } from "@/lib/theme";

// Renders the toast queue at the top of the screen. Mounted once at the root.
export function Toaster() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, gap: 8, zIndex: 100 }}
    >
      {toasts.map((item) => (
        <Pressable key={item.id} onPress={() => dismissToast(item.id)} accessibilityRole="alert">
          <Glass tier="sheet" sheen radius={RADIUS.input} style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 2 }}>
            <AppText size={13} weight="semibold">
              {item.title}
            </AppText>
            {item.description ? (
              <AppText size={12} weight="regular" tone={0.55}>
                {item.description}
              </AppText>
            ) : null}
          </Glass>
        </Pressable>
      ))}
    </View>
  );
}
