export { HistoryScreen } from "./components/history-screen";
export { HistoryView } from "./components/history-view";
export { useChats, useUpdateChat, useDeleteChat, chatsQueryKey } from "./hooks/use-chats";
export type { HistoryEntry, ThreadKind } from "./lib/data";
// Pure helpers the shell reuses for the drawer's chat list and the search
// palette, so the grouping and matching read the same everywhere.
export { groupByAge, searchEntries } from "./lib/filters";
