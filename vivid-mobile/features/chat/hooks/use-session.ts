import { useQuery } from "@tanstack/react-query";

import { backend, type MessageOut } from "@/lib/backend/client";
import type { LiveMessage, Session } from "@/features/chat/lib/types";

export const sessionQueryKey = (id: string) => ["chat", "session", id] as const;

export function toLiveMessage(message: MessageOut): LiveMessage {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    usedTools: message.used_tools,
    attachments: message.attachments,
  };
}

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
    // The thread view layers LIVE messages on top of this snapshot; a
    // mid-view refetch would re-deliver those same turns under different ids
    // and duplicate bubbles. So: never refetch while mounted, drop the cache
    // on unmount so returning to the thread loads it fresh.
    staleTime: Infinity,
    gcTime: 0,
  });
}
