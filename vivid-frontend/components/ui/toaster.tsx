"use client";

import { Toaster as Sonner } from "sonner";

// One toast surface for the whole app, mounted in providers. Styled to the
// sheet token so a toast reads as the same material as a modal.
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        style: {
          background: "var(--color-sheet)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "#fff",
        },
      }}
    />
  );
}
