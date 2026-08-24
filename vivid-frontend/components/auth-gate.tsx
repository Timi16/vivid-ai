"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getTokens } from "@/lib/backend/client";

// Client-side guard for the signed-in shell: no token, no app. Tokens live in
// localStorage, so this can only run after mount.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getTokens()) {
      router.replace("/sign-in");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;
  return <>{children}</>;
}
