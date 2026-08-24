"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MailIcon } from "@/components/ui/icons";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ProviderButton } from "@/features/auth/components/provider-buttons";
import { validateEmail } from "@/features/auth/lib/validation";
import { backend, setTokens } from "@/lib/backend/client";
import { decaneConfigured, readGoogleReturn, startGoogleSignIn } from "@/lib/backend/decane";

// Email + password against the live backend. One form serves both directions:
// sign in by default, flip to create an account.
export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishingGoogle, setFinishingGoogle] = useState(false);
  const resumedRef = useRef(false);

  // Google via Decane is a full-page redirect: Decane sends the browser back
  // to this page (the callback URL in the dashboard) with ?decane_jwt=… in
  // the query — the identity token itself. Exchange it for a Vivid session
  // on mount. Identity only: no wallet, so no passkey prompt.
  useEffect(() => {
    if (resumedRef.current) return;
    const returned = readGoogleReturn();
    if (!returned) return;
    resumedRef.current = true;
    // Deferred a tick so the first render settles before state moves.
    queueMicrotask(() => {
      if ("error" in returned) {
        setError(`Google sign-in failed: ${returned.error}`);
        return;
      }
      setFinishingGoogle(true);
      setSubmitting(true);
      backend
        .decaneLogin(returned.jwt, returned.profile)
        .then((tokens) => {
          setTokens(tokens);
          router.push("/");
        })
        .catch((err: unknown) => {
          setSubmitting(false);
          setFinishingGoogle(false);
          setError(err instanceof Error ? err.message : "Google sign-in failed");
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function googleSignIn() {
    if (!decaneConfigured) {
      setError("Google sign-in isn't configured yet (set DECANE_APP_ID and DECANE_API_KEY).");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await startGoogleSignIn(); // navigates away; only rejects on failure
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validateEmail(email);
    if (problem) {
      setError(problem);
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
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
      router.push("/");
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
        <>
          By continuing you agree to the{" "}
          <span className="text-fg/70 underline underline-offset-2">Terms</span> and{" "}
          <span className="text-fg/70 underline underline-offset-2">Privacy Policy</span>.
        </>
      }
    >
      {finishingGoogle ? (
        <p className="text-fg/60 mb-4 text-center text-[13px]">Finishing Google sign-in…</p>
      ) : null}
      <ProviderButton provider="google" onClick={googleSignIn} disabled={submitting} />

      <div className="my-5 flex items-center gap-3">
        <span className="bg-fg/10 h-px flex-1" />
        <span className="text-fg/35 text-[11.5px] font-medium tracking-wide uppercase">or</span>
        <span className="bg-fg/10 h-px flex-1" />
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field htmlFor="email" label="Email" error={error ?? undefined}>
          <div className="relative">
            <MailIcon
              size={16}
              className="text-fg/35 pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              invalid={Boolean(error)}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError(null);
              }}
              className="pl-10"
            />
          </div>
        </Field>

        <Field htmlFor="password" label="Password">
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError(null);
            }}
          />
        </Field>

        <Button type="submit" loading={submitting} className="w-full">
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setMode((prev) => (prev === "login" ? "signup" : "login"))}
        className="text-fg/60 hover:text-fg mt-4 w-full cursor-pointer text-center text-[13px]"
      >
        {mode === "login" ? "No account? Create one" : "Have an account? Sign in"}
      </button>
    </AuthCard>
  );
}
