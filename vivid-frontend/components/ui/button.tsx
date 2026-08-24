"use client";

import { ButtonSpinner } from "@/components/ui/button-spinner";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui/button-classes";

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Shows the spinner and blocks interaction. The label stays in place so the
  // button does not change width mid-action.
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? <ButtonSpinner /> : null}
      {children}
    </button>
  );
}

export { buttonClasses };
export type { ButtonVariant, ButtonSize };
