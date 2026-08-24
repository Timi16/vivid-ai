import type { HistoryEntry, ThreadKind } from "@/features/history/lib/data";

export type SortOrder = "newest" | "oldest" | "title";
export type KindFilter = "all" | ThreadKind;

export const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A to Z" },
];

export const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "chat", label: "Threads" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "computer", label: "Computer" },
];

// Search covers the title, the preview and the space name, so typing a space
// name finds everything filed under it without a separate filter.
export function searchEntries(entries: HistoryEntry[], query: string): HistoryEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) =>
    [entry.title, entry.preview, entry.space ?? ""].some((field) => field.toLowerCase().includes(needle))
  );
}

export function filterByKind(entries: HistoryEntry[], kind: KindFilter): HistoryEntry[] {
  return kind === "all" ? entries : entries.filter((entry) => entry.kind === kind);
}

export function sortEntries(entries: HistoryEntry[], order: SortOrder): HistoryEntry[] {
  // Sort a copy: the caller's array is the query result and must not be mutated.
  const out = [...entries];
  if (order === "title") {
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }
  return out.sort((a, b) => {
    const diff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    return order === "newest" ? diff : -diff;
  });
}

// Groups by how recent an entry is, which is how the list is read: nobody
// looks for an exact date, they look for "the one from yesterday".
export function groupByAge(
  entries: HistoryEntry[],
  now: Date = new Date()
): { label: string; entries: HistoryEntry[] }[] {
  const buckets: Record<string, HistoryEntry[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;

  for (const entry of entries) {
    const at = Date.parse(entry.updatedAt);
    const daysAgo = Math.floor((startOfToday.getTime() - at) / dayMs);
    if (at >= startOfToday.getTime()) buckets.Today.push(entry);
    else if (daysAgo < 1) buckets.Yesterday.push(entry);
    else if (daysAgo < 7) buckets["This week"].push(entry);
    else buckets.Earlier.push(entry);
  }

  return Object.entries(buckets)
    .filter(([, group]) => group.length > 0)
    .map(([label, group]) => ({ label, entries: group }));
}
