"use client";

import { useSyncExternalStore } from "react";

// No external store to watch: the subscribe callback is intentionally inert.
const noopSubscribe = () => () => {};

// True only after the first client render. Guards browser-only values such as
// navigator, which would otherwise differ between the server and client markup.
//
// Implemented with useSyncExternalStore rather than a setState in an effect:
// the server snapshot is false and the client snapshot is true, so React flips
// it during hydration without an extra render pass.
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
