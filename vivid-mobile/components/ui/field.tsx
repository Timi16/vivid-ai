import { View, type StyleProp, type ViewStyle } from "react-native";

import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// A labelled form row. Every form announces itself the same way.
export function Field({ label, hint, error, required, style, children }: FieldProps) {
  const { theme } = useTheme();
  return (
    <View style={[{ gap: 8 }, style]}>
      {label ? (
        <AppText size={13} weight="semibold" tone={0.85}>
          {label}
          {required ? <AppText size={13} color={theme.colors.down}> *</AppText> : null}
        </AppText>
      ) : null}
      {children}
      {hint && !error ? (
        <AppText size={12} weight="regular" tone={0.45}>
          {hint}
        </AppText>
      ) : null}
      {error ? (
        <AppText size={12} weight="regular" color={theme.colors.down} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
