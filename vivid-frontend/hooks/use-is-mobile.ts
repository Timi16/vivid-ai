"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

// Matches Tailwind's md breakpoint, so a layout decision made in JS agrees with
// one made in CSS.
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
