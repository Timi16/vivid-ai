"use client";

import { cn } from "@/lib/utils";
import type { CallState } from "@/features/chat/hooks/use-live-thread";

const STATE_LABEL: Record<CallState, string> = {
  idle: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

// The hands-free conversation modal: speak, silence sends automatically, the
// reply plays aloud, then the mic reopens. Everything lands in the thread
// behind it as text.
export function CallOverlay({
  open,
  state,
  line,
  onSendNow,
  onEnd,
}: {
  open: boolean;
  state: CallState;
  line: string;
  onSendNow: () => void;
  onEnd: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="vd-glass-card flex min-w-[320px] flex-col items-center gap-3 px-12 py-10 text-center">
        <div
          className={cn(
            "grid size-24 place-items-center rounded-full bg-fg/90 text-[40px] font-semibold text-bg",
            state === "listening" && "animate-pulse ring-8 ring-fg/15",
            state === "speaking" && "animate-pulse",
            state === "thinking" && "opacity-70"
          )}
        >
          V
        </div>
        <h3 className="ws-display text-fg text-[20px]">Vivid AI</h3>
        <p className="text-fg/50 text-[13.5px]">{STATE_LABEL[state]}</p>
        {line ? <p className="text-fg/70 max-w-[340px] text-[14px]">“{line}”</p> : null}
        <div className="mt-3 flex items-center gap-3">
          {state === "listening" ? (
            <button
              type="button"
              onClick={onSendNow}
              className="vd-glass-bright cursor-pointer rounded-full px-6 py-2.5 text-[14px] font-semibold"
            >
              Send now
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEnd}
            className="cursor-pointer rounded-full bg-red-500/90 px-6 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-red-500"
          >
            End
          </button>
        </div>
      </div>
    </div>
  );
}
