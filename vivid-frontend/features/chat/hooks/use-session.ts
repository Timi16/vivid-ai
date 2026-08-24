"use client";

import { useQuery } from "@tanstack/react-query";

import { backend } from "@/lib/backend/client";
import { toLiveMessage } from "@/features/chat/hooks/use-live-thread";
import type { Session } from "@/features/chat/lib/types";

export const sessionQueryKey = (id: string) => ["chat", "session", id] as const;

// Reads a thread from the live backend: chat metadata plus its messages.
export function useSession(id: string) {
  return useQuery<Session>({
    queryKey: sessionQueryKey(id),
    queryFn: async () => {
      const [chat, messages] = await Promise.all([backend.chat(id), backend.messages(id)]);
      return {
        id: chat.id,
        title: chat.title ?? "New chat",
        language: chat.language,
        updatedAt: chat.updated_at,
        messages: messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map(toLiveMessage),
      };
    },
    // The thread view layers LIVE messages on top of this snapshot; a mid-view
    // refetch would re-deliver those same turns under different ids and
    // duplicate bubbles. So: never refetch while mounted, drop the cache on
    // unmount so returning to the thread loads it fresh.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
}
