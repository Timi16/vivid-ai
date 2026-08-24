"use client";

import Link from "next/link";

import { topicNav } from "@/components/layout/nav-items";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { SearchIcon, SidebarIcon } from "@/components/ui/icons";

interface TopbarProps {
  onOpenSidebar: () => void;
  onOpenSearch: () => void;
}

export function Topbar({ onOpenSidebar, onOpenSearch }: TopbarProps) {
  return (
    <header className="border-fg/8 relative z-10 flex h-14 shrink-0 items-center gap-2 border-b px-3 md:px-5">
      {/* On small screens the sidebar is a drawer; this opens it. */}
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open menu"
        className="hover:vd-glass-control text-fg/55 hover:text-fg grid size-9 cursor-pointer place-items-center rounded-lg md:hidden"
      >
        <SidebarIcon size={18} />
      </button>

      {topicNav.length ? (
        <nav aria-label="Topics" className="hidden items-center gap-5 md:flex">
          {topicNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-fg/55 hover:text-fg text-[13px] font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search"
          className="hover:vd-glass-control text-fg/55 hover:text-fg grid size-9 cursor-pointer place-items-center rounded-lg transition-colors"
        >
          <SearchIcon size={17} />
        </button>
        <NotificationsMenu />
      </div>
    </header>
  );
}
