import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { backend } from "@/lib/backend/client";
import type { HistoryEntry } from "@/features/history/lib/data";

export const chatsQueryKey = ["chats"] as const;

// The user's chats from the live backend, shaped for the history list and
// the drawer.
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
        pinned: chat.pinned,
      }));
    },
    staleTime: 15_000,
  });
}

// Rename or pin. The list refetches so every surface (drawer, history, the
// thread heading) agrees without each keeping its own copy.
export function useUpdateChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; title?: string; pinned?: boolean }) =>
      backend.updateChat(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatsQueryKey }),
  });
}

export function useDeleteChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backend.deleteChat(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatsQueryKey }),
  });
}
