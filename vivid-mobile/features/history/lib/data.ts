export type ThreadKind = "chat" | "image" | "video" | "computer";

export interface HistoryEntry {
  id: string;
  title: string;
  preview: string;
  kind: ThreadKind;
  updatedAt: string;
  space?: string;
  pinned?: boolean;
}
