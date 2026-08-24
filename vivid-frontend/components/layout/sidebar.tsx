"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarIcon } from "@/components/ui/icons";
import { AccountMenu } from "@/components/layout/account-menu";
import { sidebarNav } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onShowShortcuts: () => void;
}

export function Sidebar({ collapsed, onToggle, onShowShortcuts }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "vd-glass relative z-10 flex shrink-0 flex-col border-y-0 border-l-0 border-r-white/10 transition-[width] duration-200",
        collapsed ? "w-[64px]" : "w-[232px]"
      )}
    >
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed ? (
          <Link href="/" className="ws-display text-fg px-1 text-[17px]">
            Vivid
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="hover:vd-glass-control text-fg/55 hover:text-fg grid size-9 cursor-pointer place-items-center rounded-lg transition-colors"
        >
          <SidebarIcon size={18} />
        </button>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {sidebarNav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                active ? "bg-fg/10 text-fg" : "text-fg/60 hover:bg-fg/6 hover:text-fg"
              )}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed ? <span className="truncate">{label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-fg/8 border-t p-2">
        <AccountMenu
          name="Guest"
          plan="Free plan"
          collapsed={collapsed}
          onShowShortcuts={onShowShortcuts}
        />
      </div>
    </aside>
  );
}
