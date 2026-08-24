import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

// Every variant is the same glass material at a different brightness. Hierarchy
// comes from how much light the surface carries, not from one variant being
// glass and another being flat.
const VARIANT: Record<ButtonVariant, string> = {
  // The primary action is bright glass: near-white, so it still refracts what
  // is behind it rather than reading as a painted rectangle.
  primary: "vd-glass-bright vd-sheen",
  secondary: "vd-glass-control vd-sheen text-fg hover:border-fg/28",
  outline: "vd-glass-control vd-sheen border-fg/22 text-fg hover:border-fg/40",
  // Toolbar weight. Carries the material only on hover, so a row of icon
  // buttons does not read as a row of pills.
  ghost:
    "border border-transparent text-fg/60 transition-colors hover:vd-glass-control hover:text-fg",
  danger:
    "vd-glass-control vd-sheen border-destructive/45 bg-destructive/22 text-[#ffb4b4] hover:bg-destructive/32 hover:border-destructive/65",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-full px-3 text-[12.5px]",
  md: "h-10 gap-2 rounded-full px-4 text-[13.5px]",
  lg: "h-12 gap-2 rounded-full px-6 text-[15px]",
  icon: "size-10 rounded-full",
  "icon-sm": "size-8 rounded-full",
};

const BASE = [
  "inline-flex cursor-pointer items-center justify-center font-sans font-semibold whitespace-nowrap",
  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
  "disabled:pointer-events-none disabled:opacity-45",
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
];

/**
 * The button class string on its own, for the cases that need button styling on
 * something that is not a <button>: a Link, mainly.
 *
 * This module deliberately has no "use client" directive. Button does, and a
 * Server Component cannot call a function exported from a client module, only
 * render it. Keeping the builder here lets a server-rendered Link use it.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return cn(BASE, VARIANT[variant], SIZE[size], fullWidth && "w-full", className);
}
