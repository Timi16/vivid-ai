"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CheckIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import {
  instructionsBudget,
  RESPONSE_STYLES,
  SOURCE_KINDS,
  type ResponseStyle,
} from "@/features/customize/lib/data";

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-fg/40 text-[11.5px] font-semibold tracking-wide uppercase">{title}</h2>
        {hint ? <p className="text-fg/45 text-[12px] font-normal">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function CustomizeView() {
  const [style, setStyle] = useState<ResponseStyle>("balanced");
  const [about, setAbout] = useState("");
  const [howToAnswer, setHowToAnswer] = useState("");
  const [sources, setSources] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SOURCE_KINDS.map((s) => [s.id, s.defaultOn]))
  );

  const aboutBudget = instructionsBudget(about);
  const answerBudget = instructionsBudget(howToAnswer);
  const canSave = !aboutBudget.over && !answerBudget.over;

  return (
    <div className="mx-auto w-full max-w-[760px] px-5 py-8">
      <PageHeader
        title="Customize"
        description="Tell Vivid how you want it to work. This applies to every new thread."
        actions={
          <Button
            size="md"
            disabled={!canSave}
            onClick={() =>
              toast("Preferences aren't saved yet", {
                description: "This turns on once the profile service ships.",
              })
            }
          >
            Save
          </Button>
        }
      />

      <div className="mt-7 flex flex-col gap-7">
        <Group title="Response style">
          <div className="grid gap-2.5 sm:grid-cols-3">
            {RESPONSE_STYLES.map((option) => {
              const on = style === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStyle(option.value)}
                  className={cn(
                    "vd-glass-card vd-sheen flex cursor-pointer flex-col gap-1.5 p-4 text-left transition-colors",
                    on ? "border-fg/45 bg-fg/12" : "hover:border-fg/25"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-fg text-[13px] font-semibold">{option.label}</span>
                    {on ? <CheckIcon size={14} className="text-fg ml-auto" /> : null}
                  </span>
                  <span className="text-fg/50 text-[11.5px] leading-relaxed font-normal">
                    {option.detail}
                  </span>
                </button>
              );
            })}
          </div>
        </Group>

        <Group title="About you" hint="What should Vivid know to give you better answers?">
          <div className="flex flex-col gap-2">
            <label htmlFor="about" className="sr-only">
              About you
            </label>
            <Textarea
              id="about"
              rows={4}
              value={about}
              invalid={aboutBudget.over}
              placeholder="Your role, what you work on, anything it should assume you already know."
              onChange={(event) => setAbout(event.target.value)}
            />
            <span
              className={cn(
                "self-end text-[11.5px] font-normal",
                aboutBudget.over ? "text-down" : "text-fg/35"
              )}
            >
              {aboutBudget.remaining} left
            </span>
          </div>
        </Group>

        <Group
          title="How to answer"
          hint="Tone, format, and anything it should always or never do."
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="how" className="sr-only">
              How to answer
            </label>
            <Textarea
              id="how"
              rows={4}
              value={howToAnswer}
              invalid={answerBudget.over}
              placeholder="For example: lead with the answer, use British spelling, never open with a compliment."
              onChange={(event) => setHowToAnswer(event.target.value)}
            />
            <span
              className={cn(
                "self-end text-[11.5px] font-normal",
                answerBudget.over ? "text-down" : "text-fg/35"
              )}
            >
              {answerBudget.remaining} left
            </span>
          </div>
        </Group>

        <Group title="Sources" hint="Where Vivid looks when it searches.">
          <div className="vd-glass-card vd-sheen divide-fg/8 divide-y overflow-hidden">
            {SOURCE_KINDS.map((source) => (
              <div key={source.id} className="flex items-center gap-4 px-4 py-3.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-fg text-[13.5px] font-semibold">{source.label}</span>
                  <span className="text-fg/50 text-[12px] font-normal">{source.detail}</span>
                </div>
                <Switch
                  checked={sources[source.id]}
                  onCheckedChange={(next) => setSources((prev) => ({ ...prev, [source.id]: next }))}
                  aria-label={source.label}
                />
              </div>
            ))}
          </div>
        </Group>
      </div>
    </div>
  );
}
