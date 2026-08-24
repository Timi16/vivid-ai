"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { AuthCard } from "@/features/auth/components/auth-card";
import {
  INTERESTS,
  MIN_INTERESTS,
  canContinue,
  toggleInterest,
} from "@/features/auth/lib/interests";
import { PLANS } from "@/features/auth/lib/plans";
import { validateName } from "@/features/auth/lib/validation";

const STEPS = ["name", "interests", "plan"] as const;
type Step = (typeof STEPS)[number];

// Three steps: who you are, what you follow, which plan. Nothing is persisted,
// because there is no profile endpoint yet. Each step's handler is where that
// call goes when there is one.
export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [plan, setPlan] = useState<string>("pro");

  const index = STEPS.indexOf(step);

  const eyebrow = (
    <div className="flex items-center gap-2">
      <span className="text-fg/40 text-[11.5px] font-semibold tracking-wide uppercase">
        Step {index + 1} of {STEPS.length}
      </span>
      <div className="flex flex-1 items-center gap-1">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-[3px] flex-1 rounded-full transition-colors",
              i <= index ? "bg-fg/70" : "bg-fg/12"
            )}
          />
        ))}
      </div>
    </div>
  );

  if (step === "name") {
    return (
      <AuthCard
        eyebrow={eyebrow}
        title="What should we call you?"
        subtitle="This is how Vivid will address you."
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const problem = validateName(name);
            setNameError(problem);
            if (!problem) setStep("interests");
          }}
          className="flex flex-col gap-5"
        >
          <Field htmlFor="name" label="Your name" error={nameError ?? undefined}>
            <Input
              id="name"
              autoComplete="name"
              autoFocus
              placeholder="Mark David"
              value={name}
              invalid={Boolean(nameError)}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError) setNameError(null);
              }}
            />
          </Field>

          <Button type="submit" size="lg" fullWidth>
            Continue
          </Button>
        </form>
      </AuthCard>
    );
  }

  if (step === "interests") {
    const ready = canContinue(selected);
    return (
      <AuthCard
        eyebrow={eyebrow}
        title="What are you interested in?"
        subtitle={`Pick at least ${MIN_INTERESTS}. This shapes what Vivid surfaces for you.`}
        width="md"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((interest) => {
              const on = selected.includes(interest.id);
              return (
                <button
                  key={interest.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected((prev) => toggleInterest(prev, interest.id))}
                  className={cn(
                    "vd-glass-control vd-sheen flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2",
                    "text-[12.5px] font-medium transition-colors",
                    on
                      ? "border-fg/45 bg-fg/18 text-fg"
                      : "text-fg/70 hover:border-fg/28 hover:text-fg"
                  )}
                >
                  {on ? <CheckIcon size={13} /> : null}
                  {interest.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-fg/45 text-[12.5px] font-normal">{selected.length} selected</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="md" onClick={() => setStep("name")}>
                Back
              </Button>
              <Button size="md" disabled={!ready} onClick={() => setStep("plan")}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      eyebrow={eyebrow}
      title="Choose your plan"
      subtitle="Start free and upgrade whenever you need more."
      width="lg"
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((option) => {
            const on = plan === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPlan(option.id)}
                className={cn(
                  "vd-glass-card vd-sheen vd-glass-hover flex cursor-pointer flex-col gap-3 p-5 text-left",
                  on && "border-fg/45 bg-fg/12"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-fg text-[14px] font-semibold">{option.name}</span>
                  {option.featured ? (
                    <span className="bg-fg/15 text-fg/80 rounded-full px-2 py-0.5 text-[10.5px] font-semibold">
                      Popular
                    </span>
                  ) : null}
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="ws-display text-fg text-[24px]">{option.price}</span>
                  <span className="text-fg/45 text-[11.5px] font-normal">{option.cadence}</span>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {option.features.map((feature) => (
                    <li
                      key={feature}
                      className="text-fg/60 flex items-start gap-2 text-[12px] font-normal"
                    >
                      <CheckIcon size={13} className="text-fg/40 mt-0.5 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="md" onClick={() => setStep("interests")}>
            Back
          </Button>
          <Button size="md" onClick={() => router.push("/")}>
            Start using Vivid
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
