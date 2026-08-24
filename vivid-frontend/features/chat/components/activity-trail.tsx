"use client";

import { CheckIcon } from "@/components/ui/icons";

// The live tool/step trail while a turn runs: each step the backend takes
// (searching, browsing, running code…) lands here as it happens, with a
// spinner on the current one.
export function ActivityTrail({ steps, busy }: { steps: string[]; busy: boolean }) {
  if (!steps.length) return null;
  return (
    <div className="vd-glass-card flex w-fit flex-col gap-2 px-4 py-3">
      {steps.map((step, index) => {
        const isLive = index === steps.length - 1 && busy;
        return (
          <div key={`${index}-${step}`} className="text-fg/70 flex items-center gap-2.5 text-[13px]">
            {isLive ? (
              <span className="border-fg/20 border-t-fg/70 size-3.5 animate-spin rounded-full border-2" />
            ) : (
              <CheckIcon size={14} className="text-fg/45" />
            )}
            {step}
          </div>
        );
      })}
    </div>
  );
}
