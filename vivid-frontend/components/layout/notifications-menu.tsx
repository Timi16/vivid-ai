"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Menu, MenuLabel } from "@/components/ui/menu";
import { BellIcon } from "@/components/ui/icons";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  detail: string;
  at: string;
  unread: boolean;
}

// Placeholder notifications. There is no notifications endpoint yet; this is
// the shape a real one will return.
const NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    title: "Your pricing run finished",
    detail: "14 pages visited, tables extracted.",
    at: "2026-08-23T09:05:00.000Z",
    unread: true,
  },
  {
    id: "2",
    title: "Video is ready",
    detail: "Total internal reflection, 24 seconds.",
    at: "2026-08-21T15:35:00.000Z",
    unread: true,
  },
  {
    id: "3",
    title: "Welcome to Vivid",
    detail: "Here is how to get the most out of your first week.",
    at: "2026-08-18T08:00:00.000Z",
    unread: false,
  },
];

export function NotificationsMenu() {
  const [items, setItems] = useState(NOTIFICATIONS);
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
            onClick={() => setItems((prev) => prev.map((i) => ({ ...i, unread: false })))}
          >
            Mark all read
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
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
            </div>
            <span className="text-fg/50 text-[11.5px] leading-snug font-normal">{item.detail}</span>
          </div>
        ))}
      </div>
    </Menu>
  );
}
