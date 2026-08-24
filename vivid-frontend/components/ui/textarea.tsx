"use client";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      aria-invalid={invalid || undefined}
      className={cn(
        "vd-glass-well text-fg min-h-24 w-full rounded-[16px] px-3.5 py-3 font-sans text-[14px] font-normal transition-colors",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "ws-invalid",
        className
      )}
      {...props}
    />
  );
}
