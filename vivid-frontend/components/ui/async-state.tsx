"use client";

import { isUnconfigured } from "@/lib/api/envelope";

// Shared async states for any screen backed by the API. Real data means real
// failure modes, so every screen shows one of these rather than an empty shell
// that looks like a working page with nothing in it.

export function AsyncLoading({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bg-fg/6 h-[52px] animate-pulse rounded-[14px]" />
      ))}
    </div>
  );
}

export function AsyncEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-fg/45 grid place-items-center px-4 py-14 text-center text-[13px] font-normal">
      {children}
    </div>
  );
}

interface AsyncErrorProps {
  error: unknown;
  // What the user was trying to see, e.g. "your history".
  subject: string;
  // Shown when the service is not switched on yet. Each feature explains its
  // own absence, since "not configured" means something different per service.
  unconfiguredDetail?: string;
  onRetry?: () => void;
}

// One error surface per feature. A backend that is not running yet reads as
// "not available", not as a fault the user can retry away.
export function AsyncError({
  error,
  subject,
  unconfiguredDetail = "This goes live once the service is switched on.",
  onRetry,
}: AsyncErrorProps) {
  const unconfigured = isUnconfigured(error);
  const message = unconfigured ? `${subject} isn't available yet.` : `Couldn't load ${subject}.`;
  const detail = unconfigured
    ? unconfiguredDetail
    : ((error as Error | null)?.message ?? "Something went wrong on our side.");

  return (
    <div className="vd-glass-card vd-sheen grid place-items-center px-5 py-12 text-center">
      <div className="max-w-[42ch]">
        <div className="text-fg/85 text-[14px] font-semibold">{message}</div>
        <div className="text-fg/50 mt-1.5 text-[12.5px] font-normal">{detail}</div>
        {onRetry && !unconfigured ? (
          <button
            onClick={onRetry}
            className="vd-glass-control vd-sheen text-fg hover:border-fg/28 mt-4 cursor-pointer rounded-full px-4 py-2 font-sans text-[12.5px] font-semibold"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
