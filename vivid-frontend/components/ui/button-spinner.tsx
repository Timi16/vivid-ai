import { cn } from "@/lib/utils";

// Inline loading indicator sized to sit inside a button or a field.
export function ButtonSpinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
          className
        )}
      />
      <span className="sr-only">{label}</span>
    </>
  );
}
