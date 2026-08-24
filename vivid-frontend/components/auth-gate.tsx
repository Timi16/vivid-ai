"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { getTokens } from "@/lib/backend/client";

// Tokens live in localStorage, so the signed-in state is browser-only. Reading
// it through an external store gives the server a stable "not yet" answer and
// the client the real one, with no state set from an effect.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// Client-side guard for the signed-in shell: no token, no app.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const signedIn = useSyncExternalStore(
    subscribe,
    () => Boolean(getTokens()),
    () => false
  );
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  useEffect(() => {
    if (mounted && !signedIn) router.replace("/sign-in");
  }, [mounted, signedIn, router]);

  if (!signedIn) return null;
  return <>{children}</>;
}
