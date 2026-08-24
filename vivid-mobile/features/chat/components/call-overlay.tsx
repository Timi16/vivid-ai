import { useEffect, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, View } from "react-native";

import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import type { CallState } from "@/features/chat/hooks/use-live-thread";
import { useTheme } from "@/hooks/use-theme";

const STATE_LABEL: Record<CallState, string> = {
  idle: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

// The hands-free conversation sheet: speak, silence sends automatically, the
// reply plays aloud, then the mic reopens. Everything lands in the thread
// behind it as text.
export function CallOverlay({
  open,
  state,
  line,
  onSendNow,
  onEnd,
}: {
  open: boolean;
  state: CallState;
  line: string;
  onSendNow: () => void;
  onEnd: () => void;
}) {
  const { theme } = useTheme();
  // Created once per mount; a ref would be read during render, which the
  // hooks lint forbids.
  const [pulse] = useState(() => new Animated.Value(1));

  // A slow breathing pulse while the mic is open or the reply is playing.
  useEffect(() => {
    if (!open || (state !== "listening" && state !== "speaking")) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [open, state, pulse]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onEnd}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: "rgba(0,0,0,0.6)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          },
        ]}
      >
        <Glass
          tier="card"
          sheen
          style={{
            minWidth: 300,
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 40,
            paddingVertical: 40,
          }}
        >
          <Animated.View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.fg(0.9),
              opacity: state === "thinking" ? 0.7 : 1,
              transform: [{ scale: pulse }],
              borderWidth: state === "listening" ? 8 : 0,
              borderColor: theme.fg(0.15),
            }}
          >
            <AppText size={40} weight="semibold" color={theme.colors.fgInvert}>
              V
            </AppText>
          </Animated.View>
          <AppText display size={20}>
            Vivid AI
          </AppText>
          <AppText size={13.5} tone={0.5}>
            {STATE_LABEL[state]}
          </AppText>
          {line ? (
            <AppText size={14} tone={0.7} align="center" style={{ maxWidth: 300 }}>
              “{line}”
            </AppText>
          ) : null}
          <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            {state === "listening" ? (
              <Pressable
                accessibilityRole="button"
                onPress={onSendNow}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <Glass tier="bright" sheen style={{ paddingHorizontal: 24, paddingVertical: 10 }}>
                  <AppText size={14} weight="semibold" color={theme.colors.ink}>
                    Send now
                  </AppText>
                </Glass>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={onEnd}
              style={({ pressed }) => ({
                borderRadius: 999,
                paddingHorizontal: 24,
                paddingVertical: 10,
                backgroundColor: pressed ? "rgba(239,68,68,1)" : "rgba(239,68,68,0.9)",
              })}
            >
              <AppText size={14} weight="semibold" color="#ffffff">
                End
              </AppText>
            </Pressable>
          </View>
        </Glass>
      </View>
    </Modal>
  );
}
