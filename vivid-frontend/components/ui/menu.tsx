"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { cn } from "@/lib/utils";

// Shared popup styling for every dropdown: the session row menu, the model
// picker, the account menu, the history sort menu.
const POPUP_CLASS =
  "vd-glass-sheet vd-sheen z-50 min-w-[190px] origin-[var(--transform-origin)] rounded-[16px] p-1.5 " +
  "transition-all duration-150 data-ending-style:scale-[0.97] data-ending-style:opacity-0 " +
  "data-starting-style:scale-[0.97] data-starting-style:opacity-0";

const ITEM_CLASS =
  "flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] " +
  "font-medium text-fg/75 outline-none transition-colors data-highlighted:bg-fg/10 " +
  "data-highlighted:text-fg [&_svg]:size-4 [&_svg]:shrink-0";

interface MenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
}

export function Menu({
  trigger,
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  className,
}: MenuProps) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger render={trigger as React.ReactElement} />
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="z-50"
        >
          <MenuPrimitive.Popup className={cn(POPUP_CLASS, className)}>
            {children}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

interface MenuItemProps {
  onClick?: () => void;
  // Destructive rows read red and sit below a separator.
  tone?: "default" | "danger";
  disabled?: boolean;
  children: React.ReactNode;
}

export function MenuItem({ onClick, tone = "default", disabled, children }: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      disabled={disabled}
      onClick={onClick}
      className={cn(
        ITEM_CLASS,
        tone === "danger" && "text-[#f6a5a5] data-highlighted:text-[#ffbcbc]",
        disabled && "pointer-events-none opacity-40"
      )}
    >
      {children}
    </MenuPrimitive.Item>
  );
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="bg-fg/10 my-1.5 h-px" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <MenuPrimitive.GroupLabel className="text-fg/35 px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide uppercase">
      {children}
    </MenuPrimitive.GroupLabel>
  );
}

export { MenuPrimitive };
