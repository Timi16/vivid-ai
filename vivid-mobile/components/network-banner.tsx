import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/text";
import { useOnline } from "@/hooks/use-network";

// A persistent, unmissable strip while the device is offline. Individual
// requests already fail loudly; this covers the case where the user is about
// to type into a dead connection.
export function NetworkBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 90,
        paddingTop: insets.top + 4,
        paddingBottom: 8,
        backgroundColor: "rgba(239,68,68,0.95)",
      }}
    >
      <AppText size={13} color="#ffffff" align="center">
        No internet connection. Reconnect to keep chatting.
      </AppText>
    </View>
  );
}
