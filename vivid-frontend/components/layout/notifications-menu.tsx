"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Menu, MenuLabel } from "@/components/ui/menu";
import { BellIcon } from "@/components/ui/icons";
import { markAllActivityRead, useActivityFeed } from "@/lib/activity";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationsMenu() {
  // The live in-app activity feed: replies, created files, calls, failures.
  const items = useActivityFeed();
  const unread = items.filter((item) => item.unread).length;

  return (
    <Menu
      side="bottom"
      align="end"
      className="w-[320px]"
      trigger={
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="text-fg/55 hover:bg-fg/8 hover:text-fg relative grid size-9 cursor-pointer place-items-center rounded-lg transition-colors"
        >
          <BellIcon size={18} />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="bg-fg ring-page absolute top-1.5 right-1.5 size-2 rounded-full ring-2"
            />
          ) : null}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5 pb-1">
        <MenuLabel>Notifications</MenuLabel>
        {unread > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11.5px]"
            onClick={markAllActivityRead}
          >
            Mark all read
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        {items.length === 0 ? (
          <p className="text-fg/40 px-2.5 py-3 text-[12.5px]">
            Nothing yet — replies, generated files and calls show up here.
          </p>
        ) : null}
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex flex-col gap-0.5 rounded-[10px] px-2.5 py-2",
              item.unread && "bg-fg/6"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-fg/90 flex-1 truncate text-[12.5px] font-semibold">
                {item.title}
              </span>
              <span className="text-fg/35 shrink-0 text-[10.5px] font-normal">
                {relativeTime(new Date(item.at))}
              </span>
              {item.unread ? (
                <span aria-hidden="true" className="bg-fg/70 size-1.5 shrink-0 rounded-full" />
              ) : null}
            </div>
            <span className="text-fg/50 text-[11.5px] leading-snug font-normal">{item.detail}</span>
            {item.chatId ? (
              <Link
                href={`/thread/${item.chatId}`}
                className="text-fg/60 hover:text-fg mt-0.5 w-fit text-[11.5px] font-semibold"
              >
                Open thread
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </Menu>
  );
}
