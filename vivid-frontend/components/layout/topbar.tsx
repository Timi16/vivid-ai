"use client";

import Link from "next/link";

import { topicNav } from "@/components/layout/nav-items";
import { NotificationsMenu } from "@/components/layout/notifications-menu";

export function Topbar() {
  return (
    <header className="border-fg/8 relative z-10 flex h-14 shrink-0 items-center justify-between border-b px-5">
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

      <div className="ml-auto flex items-center gap-1">
        <NotificationsMenu />
      </div>
    </header>
  );
}
