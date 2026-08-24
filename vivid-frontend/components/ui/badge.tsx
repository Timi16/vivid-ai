import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "up" | "down";

const TONE: Record<Tone, string> = {
  neutral: "bg-fg/10 text-fg/70",
  accent: "bg-accent/15 text-accent",
  up: "bg-up/15 text-up",
  down: "bg-down/15 text-down",
};

interface BadgeProps extends React.ComponentProps<"span"> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap",
        "[&_svg]:size-3 [&_svg]:shrink-0",
        TONE[tone],
        className
      )}
      {...props}
    />
  );
}
