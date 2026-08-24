"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckIcon, ComputerIcon, PauseIcon, PlayIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { progressOf, type ComputerTask } from "@/features/computer/lib/data";

// Computer runs a long task in the background and reports what it is doing.
// The step list is the whole product surface: it is how someone decides whether
// to let a run continue.
interface ComputerViewProps {
  task: ComputerTask;
  // The prompt box. Passed in by the route rather than imported, because it
  // belongs to the chat slice and a feature may not import a sibling.
  composerSlot?: React.ReactNode;
}

export function ComputerView({ task, composerSlot }: ComputerViewProps) {
  const [paused, setPaused] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);

  const progress = progressOf(task);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col px-5 py-8">
      <PageHeader
        title="Computer"
        description="Give Vivid a task and it works through it in the background."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
              {paused ? <PlayIcon size={15} /> : <PauseIcon size={15} />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button variant="danger" size="sm" onClick={() => setStopOpen(true)}>
              Stop
            </Button>
          </>
        }
      />

      <Card className="mt-6 p-5">
        <div className="flex items-start gap-3">
          <span className="vd-glass-control text-fg/75 grid size-10 shrink-0 place-items-center rounded-[13px]">
            <ComputerIcon size={18} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-fg text-[14px] font-semibold">{task.goal}</span>
            <span className="text-fg/45 text-[12px] font-normal">
              {paused ? "Paused" : "Running"} · {progress}% complete
            </span>
          </div>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Task progress"
          className="vd-glass-well mt-4 h-1.5 overflow-hidden rounded-full"
        >
          <div
            className="bg-fg/75 h-full rounded-full transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </Card>

      <ol className="mt-5 flex flex-col gap-2">
        {task.steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              "vd-glass-card vd-sheen flex items-start gap-3 rounded-[18px] p-4",
              step.state === "pending" && "opacity-55"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                step.state === "done" && "bg-fg text-fg-invert",
                step.state === "running" && "vd-glass-control text-fg",
                step.state === "pending" && "vd-glass-well text-fg/50"
              )}
            >
              {step.state === "done" ? (
                <CheckIcon size={13} />
              ) : step.state === "running" ? (
                <span className="bg-fg size-2 animate-pulse rounded-full" />
              ) : null}
            </span>

            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-fg text-[13.5px] font-semibold">
                {step.label}
                <span className="sr-only">
                  {step.state === "done"
                    ? " (done)"
                    : step.state === "running"
                      ? " (in progress)"
                      : " (not started)"}
                </span>
              </span>
              <span className="text-fg/50 text-[12.5px] leading-relaxed font-normal">
                {step.detail}
              </span>
            </div>
          </li>
        ))}
      </ol>

      {composerSlot ? <div className="mt-auto pt-8">{composerSlot}</div> : null}

      <ConfirmDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        tone="danger"
        title="Stop this run?"
        description="Work finished so far is kept, but the remaining steps are cancelled."
        confirmLabel="Stop run"
        onConfirm={() => setStopOpen(false)}
      />
    </div>
  );
}
