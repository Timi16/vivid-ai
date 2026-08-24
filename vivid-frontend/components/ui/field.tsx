import { cn } from "@/lib/utils";

interface FieldProps {
  // The control's id. Ties the label and the error message to the input.
  htmlFor: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

// A labelled form row. Use this rather than hand-wiring a label to an input,
// so every form announces itself the same way.
export function Field({ htmlFor, label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-fg/85 text-[13px] font-semibold">
          {label}
          {required ? (
            <span className="text-down ml-0.5" aria-label="required">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {children}

      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-fg/45 text-[12px] font-normal">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-down text-[12px] font-normal">
          {error}
        </p>
      ) : null}
    </div>
  );
}
