"use client";

import { useQuery } from "@tanstack/react-query";

import { backend } from "@/lib/backend/client";
import type { HistoryEntry } from "@/features/history/lib/data";

export const chatsQueryKey = ["chats"] as const;

// The user's chats from the live backend, shaped for HistoryView.
export function useChats() {
  return useQuery<HistoryEntry[]>({
    queryKey: chatsQueryKey,
    queryFn: async () => {
      const chats = await backend.chats();
      return chats.map((chat) => ({
        id: chat.id,
        title: chat.title ?? "New chat",
        preview: chat.language === "en" ? "" : `Language: ${chat.language}`,
        kind: "chat" as const,
        updatedAt: chat.updated_at,
      }));
    },
    staleTime: 15_000,
  });
}
