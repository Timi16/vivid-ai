"use client";

import { ChatLauncher } from "@/features/chat";
import { useChats } from "@/features/history/hooks/use-chats";

// The route composes the two slices: history knows whether this is the
// user's first visit, chat renders the welcome accordingly.
export function Home() {
  const { data: chats } = useChats();
  return <ChatLauncher isFirstRun={chats !== undefined && chats.length === 0} />;
}
