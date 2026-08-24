"use client";

import { useCallback, useSyncExternalStore } from "react";

// Track a CSS media query from React. The server snapshot is false, so the
// first client render matches the server and hydration stays quiet.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
