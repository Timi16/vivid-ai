import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { MailIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { AppText } from "@/components/ui/text";
import { AuthCard } from "@/features/auth/components/auth-card";
import { PinPrompt } from "@/features/auth/components/pin-prompt";
import { ProviderButton } from "@/features/auth/components/provider-buttons";
import { isGoogleSignInConfigured, signInWithGoogle } from "@/features/auth/lib/decane";
import { validateEmail, validatePassword } from "@/features/auth/lib/validation";
import { useTheme } from "@/hooks/use-theme";
import { backend, setTokens } from "@/lib/backend/client";

// Email + password against the live backend. One form serves both directions:
// sign in by default, flip to create an account. Google runs through Decane's
// in-app browser sheet and lands on the same session.
//
// There is no navigation on success: setting the tokens flips the root
// stack's guard and the app shell takes over.
export function SignInForm() {
  const { theme } = useTheme();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function googleSignIn() {
    if (!isGoogleSignInConfigured()) {
      setError("Google sign-in isn't configured yet (set EXPO_PUBLIC_DECANE_APP_ID and EXPO_PUBLIC_DECANE_API_KEY).");
      return;
    }
    setError(null);
    setGoogleBusy(true);
    try {
      const accessToken = await signInWithGoogle();
      const tokens = await backend.decaneLogin(accessToken);
      setTokens(tokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function submit() {
    const problem = validateEmail(email) ?? validatePassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const tokens =
        mode === "login"
          ? await backend.login(email.trim(), password)
          : await backend.signup(email.trim(), password);
      setTokens(tokens);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  return (
    <AuthCard
      title={mode === "login" ? "Sign in to Vivid" : "Create your Vivid account"}
      subtitle="Ask anything, and see it come to life."
      footer={
        <AppText size={12.5} weight="regular" tone={0.45} align="center">
          By continuing you agree to the <AppText size={12.5} tone={0.7}>Terms</AppText> and{" "}
          <AppText size={12.5} tone={0.7}>Privacy Policy</AppText>.
        </AppText>
      }
    >
      <PinPrompt />

      {googleBusy ? (
        <AppText size={13} tone={0.6} align="center" style={{ marginBottom: 16 }}>
          Finishing Google sign-in…
        </AppText>
      ) : null}
      <ProviderButton provider="google" onPress={googleSignIn} disabled={submitting || googleBusy} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 20 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: theme.fg(0.1) }} />
        <AppText size={11.5} tone={0.35} uppercase style={{ letterSpacing: 0.6 }}>
          or
        </AppText>
        <View style={{ flex: 1, height: 1, backgroundColor: theme.fg(0.1) }} />
      </View>

      <View style={{ gap: 16 }}>
        <Field label="Email" error={error ?? undefined}>
          <Input
            leading={<MailIcon size={16} color={theme.fg(0.35)} />}
            placeholder="you@example.com"
            value={email}
            invalid={Boolean(error)}
            onChangeText={(value) => {
              setEmail(value);
              if (error) setError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
        </Field>

        <Field label="Password">
          <Input
            placeholder="At least 8 characters"
            value={password}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            textContentType={mode === "login" ? "password" : "newPassword"}
            onChangeText={(value) => {
              setPassword(value);
              if (error) setError(null);
            }}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        </Field>

        <Button
          label={mode === "login" ? "Sign in" : "Create account"}
          loading={submitting}
          disabled={googleBusy}
          fullWidth
          onPress={() => void submit()}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setMode((prev) => (prev === "login" ? "signup" : "login"))}
        style={{ marginTop: 16, alignItems: "center" }}
      >
        <AppText size={13} tone={0.6}>
          {mode === "login" ? "No account? Create one" : "Have an account? Sign in"}
        </AppText>
      </Pressable>
    </AuthCard>
  );
}
