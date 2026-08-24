import { describe, expect, it } from "vitest";

import type { HistoryEntry } from "@/features/history/lib/data";
import {
  filterByKind,
  groupByAge,
  searchEntries,
  sortEntries,
} from "@/features/history/lib/filters";

function entry(over: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    title: "Untitled",
    preview: "",
    kind: "chat",
    updatedAt: "2026-08-23T09:00:00.000Z",
    ...over,
  };
}

describe("searchEntries", () => {
  const entries = [
    entry({ id: "a", title: "Glass refraction", preview: "light bends" }),
    entry({ id: "b", title: "Market sizing", preview: "smart glass market", space: "Research" }),
    entry({ id: "c", title: "Prism render", preview: "four images" }),
  ];

  it("returns everything for an empty query", () => {
    expect(searchEntries(entries, "   ")).toHaveLength(3);
  });

  it("matches on the title", () => {
    expect(searchEntries(entries, "prism").map((e) => e.id)).toEqual(["c"]);
  });

  it("matches on the preview", () => {
    expect(searchEntries(entries, "light bends").map((e) => e.id)).toEqual(["a"]);
  });

  it("matches on the space name", () => {
    expect(searchEntries(entries, "research").map((e) => e.id)).toEqual(["b"]);
  });

  it("ignores case", () => {
    expect(searchEntries(entries, "GLASS").map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("filterByKind", () => {
  const entries = [
    entry({ id: "a", kind: "chat" }),
    entry({ id: "b", kind: "image" }),
    entry({ id: "c", kind: "video" }),
  ];

  it("passes everything through for all", () => {
    expect(filterByKind(entries, "all")).toHaveLength(3);
  });

  it("keeps only the requested kind", () => {
    expect(filterByKind(entries, "image").map((e) => e.id)).toEqual(["b"]);
  });
});

describe("sortEntries", () => {
  const entries = [
    entry({ id: "mid", title: "B", updatedAt: "2026-08-20T09:00:00.000Z" }),
    entry({ id: "new", title: "C", updatedAt: "2026-08-23T09:00:00.000Z" }),
    entry({ id: "old", title: "A", updatedAt: "2026-08-01T09:00:00.000Z" }),
  ];

  it("puts the most recent first", () => {
    expect(sortEntries(entries, "newest").map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("reverses for oldest", () => {
    expect(sortEntries(entries, "oldest").map((e) => e.id)).toEqual(["old", "mid", "new"]);
  });

  it("sorts alphabetically by title", () => {
    expect(sortEntries(entries, "title").map((e) => e.title)).toEqual(["A", "B", "C"]);
  });

  it("does not mutate the input", () => {
    const before = entries.map((e) => e.id);
    sortEntries(entries, "oldest");
    expect(entries.map((e) => e.id)).toEqual(before);
  });
});

describe("groupByAge", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");

  it("buckets by recency and drops empty buckets", () => {
    const groups = groupByAge(
      [
        entry({ id: "today", updatedAt: "2026-08-23T08:00:00.000Z" }),
        entry({ id: "yesterday", updatedAt: "2026-08-22T20:00:00.000Z" }),
        entry({ id: "week", updatedAt: "2026-08-19T20:00:00.000Z" }),
        entry({ id: "old", updatedAt: "2026-07-02T20:00:00.000Z" }),
      ],
      now
    );

    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "This week", "Earlier"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["today"]);
    expect(groups[3].entries.map((e) => e.id)).toEqual(["old"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByAge([], now)).toEqual([]);
  });
});
