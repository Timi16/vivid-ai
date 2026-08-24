import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Glass } from "@/components/ui/glass";
import { ArrowUpIcon, ChevronDownIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { FONT } from "@/lib/theme";

const MODEL = "Vivid Computer";
const MAX_HEIGHT = 220;

// The prompt box under the run. On the web this is the chat slice's composer
// wired up by the route; here the feature owns a trimmed copy of it, since a
// feature may not import a sibling and there is no chat slice to borrow from.
// Grows with its content up to a cap, then scrolls.
export function ComputerComposer() {
  const { theme } = useTheme();
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);

  const canSend = prompt.trim().length > 0;

  function submit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    // There is no agent service yet, so a send only settles the text. The
    // real submit lands in the same place the sample task does.
    setPrompt(trimmed);
  }

  return (
    <Glass
      tier="card"
      sheen
      style={[
        { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
        focused && { borderColor: theme.fg(0.25) },
      ]}
    >
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="Ask anything…"
        placeholderTextColor={theme.fg(0.4)}
        selectionColor={theme.fg(0.5)}
        keyboardAppearance={theme.mode}
        accessibilityLabel="Ask anything"
        multiline
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          color: theme.colors.fg,
          fontFamily: FONT.regular,
          fontSize: 15,
          maxHeight: MAX_HEIGHT,
          paddingVertical: 4,
          textAlignVertical: "top",
        }}
      />

      <View
        style={{
          marginTop: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
        }}
      >
        <View
          style={{
            height: 32,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
          }}
        >
          <AppText size={12.5} tone={0.55}>
            {MODEL}
          </AppText>
          <ChevronDownIcon size={14} color={theme.fg(0.4)} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={submit}
          style={({ pressed }) => ({ opacity: !canSend ? 0.35 : pressed ? 0.8 : 1 })}
        >
          <Glass
            tier="bright"
            sheen
            radius={16}
            style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
          >
            <ArrowUpIcon size={16} color={theme.colors.ink} />
          </Glass>
        </Pressable>
      </View>
    </Glass>
  );
}
