import type { HistoryEntry } from "./data";
import { filterByKind, groupByAge, searchEntries, sortEntries } from "./filters";

const entries: HistoryEntry[] = [
  {
    id: "a",
    title: "Glass refraction",
    preview: "Light bends",
    kind: "chat",
    updatedAt: "2026-08-24T09:00:00Z",
    space: "Optics",
  },
  {
    id: "b",
    title: "Prism render",
    preview: "Four images",
    kind: "image",
    updatedAt: "2026-08-23T09:00:00Z",
  },
  {
    id: "c",
    title: "Market sizing",
    preview: "Roughly $6.7B",
    kind: "chat",
    updatedAt: "2026-08-20T09:00:00Z",
  },
  { id: "d", title: "Old notes", preview: "", kind: "chat", updatedAt: "2026-07-01T09:00:00Z" },
];

describe("searchEntries", () => {
  it("matches title, preview and space, case-insensitively", () => {
    expect(searchEntries(entries, "optics").map((e) => e.id)).toEqual(["a"]);
    expect(searchEntries(entries, "IMAGES").map((e) => e.id)).toEqual(["b"]);
    expect(searchEntries(entries, "  ")).toHaveLength(4);
  });
});

describe("filterByKind", () => {
  it("keeps everything for all and only the kind otherwise", () => {
    expect(filterByKind(entries, "all")).toHaveLength(4);
    expect(filterByKind(entries, "image").map((e) => e.id)).toEqual(["b"]);
  });
});

describe("sortEntries", () => {
  it("sorts newest, oldest and by title without mutating the input", () => {
    const copy = [...entries];
    expect(sortEntries(entries, "newest").map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    expect(sortEntries(entries, "oldest").map((e) => e.id)).toEqual(["d", "c", "b", "a"]);
    expect(sortEntries(entries, "title").map((e) => e.id)).toEqual(["a", "c", "d", "b"]);
    expect(entries).toEqual(copy);
  });
});

describe("groupByAge", () => {
  it("buckets by today, yesterday, this week and earlier, dropping empty groups", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    const groups = groupByAge(entries, now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "This week", "Earlier"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["a"]);
    expect(groups[3].entries.map((e) => e.id)).toEqual(["d"]);
  });
});
