"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "@/lib/utils";

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root className={cn("flex flex-col", className)} {...props} />;
}

// The rail carries the glass; the active tab is a lit panel sliding under the
// labels rather than a border, so it matches the material everywhere else.
export function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn(
        "vd-glass-control relative flex w-fit items-center gap-1 rounded-full p-1",
        className
      )}
      {...props}
    />
  );
}

export function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative z-10 cursor-pointer rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold",
        "text-fg/55 transition-colors outline-none select-none",
        "hover:text-fg/80 data-selected:text-fg",
        className
      )}
      {...props}
    />
  );
}

export function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      className={cn(
        "bg-fg/14 absolute top-1 left-0 z-0 h-[calc(100%-0.5rem)] rounded-full",
        "transition-all duration-200 ease-out",
        "w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)]",
        className
      )}
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel className={cn("outline-none", className)} {...props} />;
}
