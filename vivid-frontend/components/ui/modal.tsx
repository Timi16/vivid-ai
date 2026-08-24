"use client";

import { Dialog } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  // Hides the title visually but keeps it for screen readers. For modals whose
  // heading is obvious from context, like a plain image viewer.
  hideTitle?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const SIZE = {
  sm: "max-w-[400px]",
  md: "max-w-[520px]",
  lg: "max-w-[680px]",
  xl: "max-w-[880px]",
};

// The one modal in the app. Every dialog flow uses it, so focus handling,
// escape, and the backdrop behave identically everywhere.
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  hideTitle,
  size = "md",
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[3px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className={cn(
            "vd-glass-sheet vd-sheen fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[22px] p-6",
            "transition-all duration-200 data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0",
            SIZE[size],
            className
          )}
        >
          <Dialog.Title className={cn("ws-display text-fg text-[19px]", hideTitle && "sr-only")}>
            {title}
          </Dialog.Title>

          {description ? (
            <Dialog.Description className="text-fg/55 mt-1.5 text-[13px] font-normal">
              {description}
            </Dialog.Description>
          ) : null}

          <div className={cn(!hideTitle && "mt-5")}>{children}</div>

          {footer ? <div className="mt-6 flex items-center justify-end gap-2">{footer}</div> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Dialog as ModalPrimitive };
