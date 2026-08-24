import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ScreenProps {
  // Scrolls by default. Screens with their own list (the thread) turn it off.
  scroll?: boolean;
  // Vertically centres short content, for empty states and auth cards.
  center?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// The frame every inner page renders inside: consistent gutters, safe-area
// aware, keyboard aware. Pages compose features inside it.
export function Screen({
  scroll = true,
  center = false,
  padded = true,
  contentStyle,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingHorizontal: padded ? 20 : 0,
    paddingTop: padded ? 20 : 0,
    paddingBottom: insets.bottom + (padded ? 24 : 0),
  };
  if (!scroll) {
    return (
      <View style={[{ flex: 1 }, padding, center && { justifyContent: "center" }, contentStyle]}>
        {children}
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          { flexGrow: 1 },
          padding,
          center && { justifyContent: "center" },
          contentStyle,
        ]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
