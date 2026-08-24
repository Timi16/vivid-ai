// The launcher creates a chat, stashes what should happen first (a prompt, or
// a call), and navigates to the thread, which acts on the stash exactly once.
// Mirrors the web's sessionStorage handoff, in memory.

import { handoff } from "@/lib/storage";

export interface PendingPrompt {
  text: string;
  attachmentId: string | null;
  imageUrl: string | null;
}

const promptKey = (chatId: string) => `vivid-pending-${chatId}`;
const callKey = (chatId: string) => `vivid-pending-call-${chatId}`;

export function stashPendingPrompt(chatId: string, pending: PendingPrompt) {
  handoff.set(promptKey(chatId), JSON.stringify(pending));
}

export function takePendingPrompt(chatId: string): PendingPrompt | null {
  const raw = handoff.take(promptKey(chatId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingPrompt>;
    if (typeof parsed.text !== "string") return null;
    return { text: parsed.text, attachmentId: parsed.attachmentId ?? null, imageUrl: parsed.imageUrl ?? null };
  } catch {
    return null;
  }
}

export function stashPendingCall(chatId: string) {
  handoff.set(callKey(chatId), "1");
}

export function takePendingCall(chatId: string): boolean {
  return handoff.take(callKey(chatId)) !== null;
}
