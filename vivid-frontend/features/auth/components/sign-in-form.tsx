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
import {
  decaneConfigured,
  readGoogleReturn,
  startEmailSignIn,
  startGoogleSignIn,
} from "@/lib/backend/decane";

const NOT_CONFIGURED =
  "Sign-in isn't configured yet (set DECANE_APP_ID and DECANE_API_KEY).";

// Passwordless. Identity is Decane's job: Google, or a code emailed to the
// address you type. Nothing here ever holds a password.
export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishingGoogle, setFinishingGoogle] = useState(false);
  const resumedRef = useRef(false);

  // Google is a full-page redirect: Decane sends the browser back here (the
  // callback URL registered for the API key) with ?decane_jwt=… — the very
  // access token our backend verifies. Exchange it for a Vivid session.
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
      setError(NOT_CONFIGURED);
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

  async function emailSignIn(event: React.FormEvent) {
    event.preventDefault();
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
    setSubmitting(true);
    const address = email.trim().toLowerCase();
    try {
      await startEmailSignIn(address);
      router.push(`/verify?email=${encodeURIComponent(address)}`);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Could not send the code");
    }
  }

  return (
    <AuthCard
      title="Sign in to Vivid"
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

      <div className="flex flex-col gap-2.5">
        <ProviderButton provider="google" onClick={googleSignIn} disabled={submitting} />
        <ProviderButton
          provider="kingschat"
          comingSoon
          onClick={() => {
            setError(null);
            setNotice("KingsChat sign-in is coming soon. Use Google or your email for now.");
          }}
        />
      </div>

      {notice ? (
        <p role="status" className="text-fg/55 mt-3 text-center text-[12.5px]">
          {notice}
        </p>
      ) : null}

      <div className="my-5 flex items-center gap-3">
        <span className="bg-fg/10 h-px flex-1" />
        <span className="text-fg/35 text-[11.5px] font-medium tracking-wide uppercase">or</span>
        <span className="bg-fg/10 h-px flex-1" />
      </div>

      <form onSubmit={emailSignIn} noValidate className="flex flex-col gap-4">
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
                if (notice) setNotice(null);
              }}
              className="pl-10"
            />
          </div>
        </Field>

        <Button type="submit" loading={submitting && !finishingGoogle} className="w-full">
          Continue with email
        </Button>
      </form>

      <p className="text-fg/45 mt-4 text-center text-[12.5px]">
        We email you a six-digit code. No password to remember.
      </p>
    </AuthCard>
  );
}
