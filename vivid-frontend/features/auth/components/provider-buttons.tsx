"use client";

import { cn } from "@/lib/utils";

// Monochrome provider marks. Drawn rather than imported so they inherit
// currentColor and match the stroke weight of the rest of the icon set.
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.6 12.23c0-.7-.06-1.37-.18-2.02H12v3.82h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.32Z"
        fill="currentColor"
      />
      <path
        d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.22-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.13H3.07v2.6A10 10 0 0 0 12 22Z"
        fill="currentColor"
        opacity="0.75"
      />
      <path
        d="M6.4 13.89a6 6 0 0 1 0-3.78v-2.6H3.07a10 10 0 0 0 0 8.98l3.33-2.6Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.85-2.85C16.95 2.99 14.7 2 12 2A10 10 0 0 0 3.07 7.51l3.33 2.6C7.19 7.74 9.4 5.98 12 5.98Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.7 12.66c0-2.32 1.9-3.44 1.98-3.5-1.08-1.58-2.76-1.8-3.36-1.82-1.43-.15-2.79.84-3.51.84-.73 0-1.84-.82-3.03-.8-1.56.02-3 .9-3.8 2.29-1.62 2.81-.41 6.97 1.16 9.25.77 1.12 1.68 2.37 2.88 2.33 1.16-.05 1.6-.75 3-.75 1.39 0 1.79.75 3.01.72 1.24-.02 2.03-1.13 2.79-2.25.88-1.29 1.24-2.54 1.26-2.6-.03-.01-2.41-.93-2.43-3.7Z"
        fill="currentColor"
      />
      <path
        d="M14.42 5.86c.64-.78 1.07-1.85.95-2.93-.92.04-2.04.61-2.7 1.38-.59.69-1.11 1.79-.97 2.85 1.03.08 2.08-.52 2.72-1.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

interface ProviderButtonProps {
  provider: "google" | "apple";
  onClick?: () => void;
  disabled?: boolean;
}

const LABEL = {
  google: "Continue with Google",
  apple: "Continue with Apple",
};

export function ProviderButton({ provider, onClick, disabled }: ProviderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "vd-glass-control vd-sheen flex h-11 w-full cursor-pointer items-center justify-center gap-2.5",
        "text-fg rounded-full text-[13.5px] font-semibold",
        "hover:border-fg/28 disabled:pointer-events-none disabled:opacity-45",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
      )}
    >
      {provider === "google" ? <GoogleMark /> : <AppleMark />}
      {LABEL[provider]}
    </button>
  );
}
