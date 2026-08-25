import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { MailIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { AppText } from "@/components/ui/text";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ProviderButton } from "@/features/auth/components/provider-buttons";
import { validateEmail } from "@/features/auth/lib/validation";
import { useTheme } from "@/hooks/use-theme";
import { backend, setTokens } from "@/lib/backend/client";
import { decaneConfigured, signInWithGoogle, startEmailSignIn } from "@/lib/backend/decane";

const NOT_CONFIGURED =
  "Sign-in isn't configured yet (set EXPO_PUBLIC_DECANE_APP_ID and EXPO_PUBLIC_DECANE_API_KEY).";

// Passwordless. Identity is Decane's job: Google through the system auth
// sheet, or a code emailed to the address you type. Nothing here ever holds a
// password.
//
// There is no navigation on a Google success: setting the tokens flips the
// root stack's guard and the app shell takes over. The email path needs the
// code screen first.
export function SignInForm() {
  const router = useRouter();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishingGoogle, setFinishingGoogle] = useState(false);

  async function googleSignIn() {
    if (!decaneConfigured) {
      setError(NOT_CONFIGURED);
      return;
    }
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const returned = await signInWithGoogle();
      // A dismissed sheet is not an error; the form is simply back.
      if (!returned) return;
      if ("error" in returned) {
        setError(`Google sign-in failed: ${returned.error}`);
        return;
      }
      setFinishingGoogle(true);
      const tokens = await backend.decaneLogin(returned.jwt, returned.profile);
      setTokens(tokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setSubmitting(false);
      setFinishingGoogle(false);
    }
  }

  async function emailSignIn() {
    const problem = validateEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    if (!decaneConfigured) {
      setError(NOT_CONFIGURED);
      return;
    }
    setError(null);
    setNotice(null);
    setSubmitting(true);
    const address = email.trim().toLowerCase();
    try {
      await startEmailSignIn(address);
      router.push({ pathname: "/verify", params: { email: address } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Sign in to Vivid"
      subtitle="Ask anything, and see it come to life."
      footer={
        <AppText size={12.5} weight="regular" tone={0.45} align="center">
          By continuing you agree to the{" "}
          <AppText size={12.5} tone={0.7}>
            Terms
          </AppText>{" "}
          and{" "}
          <AppText size={12.5} tone={0.7}>
            Privacy Policy
          </AppText>
          .
        </AppText>
      }
    >
      {finishingGoogle ? (
        <AppText size={13} tone={0.6} align="center" style={{ marginBottom: 16 }}>
          Finishing Google sign-in…
        </AppText>
      ) : null}

      <View style={{ gap: 10 }}>
        <ProviderButton provider="google" onPress={googleSignIn} disabled={submitting} />
        <ProviderButton
          provider="kingschat"
          comingSoon
          onPress={() => {
            setError(null);
            setNotice("KingsChat sign-in is coming soon. Use Google or your email for now.");
          }}
        />
      </View>

      {notice ? (
        <AppText size={12.5} tone={0.55} align="center" style={{ marginTop: 12 }}>
          {notice}
        </AppText>
      ) : null}

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
              if (notice) setNotice(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={() => void emailSignIn()}
          />
        </Field>

        <Button
          label="Continue with email"
          loading={submitting && !finishingGoogle}
          disabled={submitting}
          fullWidth
          onPress={() => void emailSignIn()}
        />
      </View>

      <AppText size={12.5} weight="regular" tone={0.45} align="center" style={{ marginTop: 16 }}>
        We email you a six-digit code. No password to remember.
      </AppText>
    </AuthCard>
  );
}
