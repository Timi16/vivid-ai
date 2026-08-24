"use client";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  invalid?: boolean;
}

export function Input({ className, invalid, type = "text", ...props }: InputProps) {
  return (
    <input
      data-slot="input"
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        "vd-glass-well text-fg h-11 w-full rounded-[14px] px-3.5 font-sans text-[14px] font-normal transition-colors",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "ws-invalid",
        className
      )}
      {...props}
    />
  );
}
