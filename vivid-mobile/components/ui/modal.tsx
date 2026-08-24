import {
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import { RADIUS } from "@/lib/theme";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  // Hides the title visually but keeps it for screen readers.
  hideTitle?: boolean;
  // Tapping the backdrop closes by default. Confirmations turn this off.
  dismissable?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  // Tight padding for content that fills the sheet, like an image viewer.
  bare?: boolean;
}

// The one modal in the app. Every dialog flow uses it, so the backdrop, the
// keyboard handling and the sheet weight behave identically everywhere.
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  hideTitle,
  dismissable = true,
  children,
  footer,
  bare = false,
}: ModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <NativeModal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onOpenChange(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          accessibilityLabel="Close"
          onPress={() => dismissable && onOpenChange(false)}
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.65)" }]}
        />
        <View
          pointerEvents="box-none"
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 16,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <Glass
            tier="sheet"
            sheen
            radius={RADIUS.sheet}
            accessibilityViewIsModal
            accessibilityLabel={title}
            style={{ padding: bare ? 12 : 24, maxHeight: "100%" }}
          >
            {!hideTitle ? (
              <AppText display size={19}>
                {title}
              </AppText>
            ) : null}
            {description ? (
              <AppText size={13} weight="regular" tone={0.55} style={{ marginTop: 6 }}>
                {description}
              </AppText>
            ) : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ marginTop: hideTitle ? 0 : 20, flexGrow: 0 }}
              contentContainerStyle={{ flexGrow: 0 }}
            >
              {children}
            </ScrollView>
            {footer ? (
              <View
                style={{
                  marginTop: 24,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                {footer}
              </View>
            ) : null}
          </Glass>
        </View>
      </KeyboardAvoidingView>
    </NativeModal>
  );
}
