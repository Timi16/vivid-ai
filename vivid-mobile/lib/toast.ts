// A small toast store, standing in for sonner. Anything can call toast();
// the Toaster host at the root renders the queue. Kept framework-light so a
// hook or a plain module can raise one without a component in scope.

import { useSyncExternalStore } from "react";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
}

const DURATION_MS = 3200;

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function toast(title: string, options: { description?: string } = {}) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  toasts = [...toasts, { id, title, description: options.description }].slice(-3);
  emit();
  setTimeout(() => dismissToast(id), DURATION_MS);
}

export function dismissToast(id: string) {
  if (!toasts.some((item) => item.id === id)) return;
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => toasts;

export function useToasts() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
