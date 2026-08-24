"use client";

// In-app activity feed: what the assistant has actually been doing this
// session (replies finished, files created, tools used, calls, errors). The
// notifications menu reads it; the live-thread hook writes to it. Per-tab and
// in-memory on purpose — a notifications backend can replace the store later
// without touching either side.

import { useSyncExternalStore } from "react";

export interface ActivityItem {
  id: string;
  kind: "reply" | "file" | "call" | "error";
  title: string;
  detail: string;
  at: number;
  unread: boolean;
}

const MAX_ITEMS = 25;

let items: ActivityItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function pushActivity(entry: Omit<ActivityItem, "id" | "at" | "unread">) {
  items = [
    { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), unread: true },
    ...items,
  ].slice(0, MAX_ITEMS);
  emit();
}

export function markAllActivityRead() {
  items = items.map((item) => ({ ...item, unread: false }));
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => items;
const getServerSnapshot = (): ActivityItem[] => [];

export function useActivityFeed() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
