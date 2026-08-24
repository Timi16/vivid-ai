"use client";

import { useState } from "react";

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
  src?: string | null;
  size?: Size;
  className?: string;
}

// Photo when there is one (Google sign-in supplies it), initials otherwise —
// and initials again if the photo fails to load, since a broken <img> is a
// worse fallback than a letter.
export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(src) && !broken;
  return (
    <span
      data-slot="avatar"
      data-size={size}
      className={cn(
        "bg-fg/10 text-fg/80 inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold select-none",
        SIZE[size],
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? ""}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}
