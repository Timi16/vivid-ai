import { useSyncExternalStore } from "react";

// Whether the search palette is open. A tiny store rather than context so the
// drawer's Search row and the topbar's search button, which live in different
// navigator subtrees, can both open the one palette mounted in the shell.
let open = false;
const listeners = new Set<() => void>();

export function setSearchOpen(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => open;

export function useSearchOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
