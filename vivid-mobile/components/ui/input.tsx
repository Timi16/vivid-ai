import { useState } from "react";
import { TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";

import { Glass } from "@/components/ui/glass";
import { useTheme } from "@/hooks/use-theme";
import { FONT, RADIUS } from "@/lib/theme";

export interface InputProps extends TextInputProps {
  invalid?: boolean;
  leading?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

// A text field cut into the glass rather than floating on it. The well tier
// inverts the highlight so it reads as recessed.
export function Input({ invalid, leading, containerStyle, style, multiline, ...props }: InputProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Glass
      tier="well"
      radius={RADIUS.input}
      invalid={invalid}
      style={[
        {
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          paddingHorizontal: 14,
          minHeight: 44,
        },
        focused && !invalid && { borderColor: theme.fg(0.35) },
        containerStyle,
      ]}
    >
      {leading ? <View style={{ marginRight: 10, marginTop: multiline ? 12 : 0 }}>{leading}</View> : null}
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={theme.fg(0.4)}
        selectionColor={theme.fg(0.5)}
        keyboardAppearance={theme.mode}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[
          {
            flex: 1,
            color: theme.colors.fg,
            fontFamily: FONT.regular,
            fontSize: 14,
            paddingVertical: multiline ? 12 : 10,
            textAlignVertical: multiline ? "top" : "center",
          },
          style,
        ]}
      />
    </Glass>
  );
}

// A multi-line input with a sensible default height.
export function Textarea({ rows = 3, style, ...props }: InputProps & { rows?: number }) {
  return <Input {...props} multiline style={[{ minHeight: rows * 22 + 16 }, style]} />;
}
