"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MailIcon } from "@/components/ui/icons";
import { AuthCard } from "@/features/auth/components/auth-card";
import { validateEmail } from "@/features/auth/lib/validation";
import { backend, setTokens } from "@/lib/backend/client";

// Email + password against the live backend. One form serves both directions:
// sign in by default, flip to create an account.
export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
