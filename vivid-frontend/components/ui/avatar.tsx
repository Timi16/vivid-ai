import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "size-7 text-[10px]",
  md: "size-9 text-[12px]",
  lg: "size-12 text-[15px]",
};

interface AvatarProps {
  name: string;
  size?: Size;
  className?: string;
}

// Initials only. There is no uploaded-image path yet, and a broken <img> is a
// worse fallback than a letter.
export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      data-size={size}
      className={cn(
        "bg-fg/10 text-fg/80 inline-grid shrink-0 place-items-center rounded-full font-semibold select-none",
        SIZE[size],
        className
      )}
    >
      <span aria-hidden="true">{initials(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
