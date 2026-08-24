import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { AppText } from "@/components/ui/text";
import { AuthCard } from "@/features/auth/components/auth-card";
import { CODE_LENGTH, normaliseCode, validateCode } from "@/features/auth/lib/validation";
import { useTheme } from "@/hooks/use-theme";
import { RADIUS } from "@/lib/theme";

const RESEND_SECONDS = 30;

// Six boxes over one invisible input. The input is the real control, so
// paste, SMS autofill and the keyboard all behave; the boxes are presentation.
// Not wired to a verification endpoint yet, exactly like the web.
export function VerifyForm({ email }: { email?: string }) {
  const router = useRouter();
  const { theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function submit() {
    const problem = validateCode(code);
    setError(problem);
    if (problem) return;
    setSubmitting(true);
    router.push("/onboarding");
  }

  return (
    <AuthCard
      title="Check your email"
      subtitle={`We sent a ${CODE_LENGTH}-digit code to ${email ?? "your email"}.`}
      footer={
        <Pressable accessibilityRole="button" onPress={() => router.replace("/sign-in")}>
          <AppText size={12.5} tone={0.6} style={{ textDecorationLine: "underline" }}>
            Use a different email
          </AppText>
        </Pressable>
      }
    >
      <View style={{ gap: 20 }}>
        <View>
          <Pressable accessibilityLabel="Verification code" onPress={() => inputRef.current?.focus()}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {Array.from({ length: CODE_LENGTH }, (_, i) => {
                const char = code[i];
                const active = i === code.length;
                return (
                  <Glass
                    key={i}
                    tier="well"
                    radius={RADIUS.input}
                    invalid={Boolean(error)}
                    style={[
                      { flex: 1, height: 56, alignItems: "center", justifyContent: "center" },
                      active && !error && { borderColor: theme.fg(0.35) },
                    ]}
                  >
                    <AppText size={20} weight="semibold" mono>
                      {char ?? ""}
                    </AppText>
                  </Glass>
                );
              })}
            </View>
            {/* The real field, held invisible over the boxes. */}
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={(value) => {
                setCode(normaliseCode(value));
                if (error) setError(null);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              autoFocus
              maxLength={CODE_LENGTH}
              caretHidden
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}
            />
          </Pressable>
          {error ? (
            <AppText size={12} weight="regular" color={theme.colors.down} style={{ marginTop: 10 }} accessibilityRole="alert">
              {error}
            </AppText>
          ) : null}
        </View>

        <Button size="lg" label="Verify and continue" fullWidth loading={submitting} onPress={submit} />

        {secondsLeft > 0 ? (
          <AppText size={12.5} weight="regular" tone={0.45} align="center">
            Resend the code in {secondsLeft}s
          </AppText>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setSecondsLeft(RESEND_SECONDS)} style={{ alignItems: "center" }}>
            <AppText size={12.5} tone={0.7} style={{ textDecorationLine: "underline" }}>
              Send a new code
            </AppText>
          </Pressable>
        )}
      </View>
    </AuthCard>
  );
}
