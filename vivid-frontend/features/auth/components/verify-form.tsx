"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthCard } from "@/features/auth/components/auth-card";
import { CODE_LENGTH, normaliseCode, validateCode } from "@/features/auth/lib/validation";

const RESEND_SECONDS = 30;

// Six separate boxes over one input. The input is the real control, so paste,
// autofill and the on-screen keyboard all behave; the boxes are presentation.
export function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "your email";

  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validateCode(code);
    setError(problem);
    if (problem) return;

    setSubmitting(true);
    router.push("/onboarding");
  }

  return (
    <AuthCard
      title="Check your email"
      subtitle={`We sent a ${CODE_LENGTH}-digit code to ${email}.`}
      footer={
        <button
          type="button"
          onClick={() => router.push("/sign-in")}
          className="text-fg/60 hover:text-fg cursor-pointer underline underline-offset-2"
        >
          Use a different email
        </button>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <label htmlFor="code" className="sr-only">
            Verification code
          </label>

          <div className="relative" onClick={() => inputRef.current?.focus()} role="presentation">
            <input
              ref={inputRef}
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={CODE_LENGTH}
              value={code}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "code-error" : undefined}
              onChange={(event) => {
                setCode(normaliseCode(event.target.value));
                if (error) setError(null);
              }}
              // The real field, held transparent over the boxes so every native
              // input behaviour still works.
              className="absolute inset-0 z-10 w-full cursor-pointer opacity-0"
            />

            <div className="flex items-center justify-between gap-2">
              {Array.from({ length: CODE_LENGTH }, (_, i) => {
                const char = code[i];
                const active = i === code.length;
                return (
                  <div
                    key={i}
                    aria-hidden="true"
                    className={cn(
                      "vd-glass-well grid h-14 flex-1 place-items-center rounded-[14px]",
                      "text-fg font-mono text-[20px] font-semibold transition-colors",
                      active && "border-fg/35",
                      error && "border-[rgba(246,165,165,0.55)]"
                    )}
                  >
                    {char ?? ""}
                  </div>
                );
              })}
            </div>
          </div>

          {error ? (
            <p id="code-error" role="alert" className="text-down mt-2.5 text-[12px] font-normal">
              {error}
            </p>
          ) : null}
        </div>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Verify and continue
        </Button>

        <p className="text-fg/45 text-center text-[12.5px] font-normal">
          {secondsLeft > 0 ? (
            <>Resend the code in {secondsLeft}s</>
          ) : (
            <button
              type="button"
              onClick={() => setSecondsLeft(RESEND_SECONDS)}
              className="text-fg/70 hover:text-fg cursor-pointer underline underline-offset-2"
            >
              Send a new code
            </button>
          )}
        </p>
      </form>
    </AuthCard>
  );
}
