"use client";

import { useEffect } from "react";

// Route-level error boundary. Anything that escapes a feature lands here.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No reporter is wired up yet. Logging with the digest is what makes a
    // production error traceable once one is.
    console.error("Unhandled error:", error.digest, error);
  }, [error]);

  return (
    <div className="grid min-h-full place-items-center px-5 py-24 text-center">
      <div className="vd-glass-card vd-sheen max-w-[46ch] px-6 py-10">
        <h1 className="text-fg/85 text-[15px] font-semibold">Something went wrong</h1>
        <p className="text-fg/50 mt-1.5 text-[12.5px] font-normal">
          {error.message || "We hit an unexpected problem. Try again."}
        </p>
        <button
          onClick={reset}
          className="vd-glass-control vd-sheen text-fg hover:border-fg/28 mt-5 cursor-pointer rounded-full px-4 py-2 font-sans text-[12.5px] font-semibold"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
