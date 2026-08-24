"use client";

import { useHealth } from "@/features/system/hooks/use-health";
import { cn } from "@/lib/utils";

// Shows whether the FastAPI service is answering. Exercises the whole data
// path in one component: hook, service client, route handler, backend.
export function BackendStatus({ className }: { className?: string }) {
  const { data, isPending, isError } = useHealth();

  const state = isPending ? "checking" : isError ? "down" : data?.status === "ok" ? "up" : "down";

  const dot = {
    checking: "bg-fg/30",
    up: "bg-up",
    down: "bg-down",
  }[state];

  const label = {
    checking: "Checking backend",
    up: "Backend connected",
    down: "Backend unreachable",
  }[state];

  return (
    <div
      className={cn("text-fg/45 inline-flex items-center gap-2 text-[12px] font-normal", className)}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
