import { describe, expect, it } from "vitest";

import { SUGGESTIONS, shuffle, type Suggestion } from "@/features/chat/lib/suggestions";

describe("shuffle", () => {
  it("keeps every item", () => {
    const out = shuffle(SUGGESTIONS, 1);
    const labels = (items: Suggestion[]) => items.map((item) => item.label).sort();
    expect(out).toHaveLength(SUGGESTIONS.length);
    expect(labels(out)).toEqual(labels(SUGGESTIONS));
  });

  it("is deterministic for a given seed", () => {
    expect(shuffle(SUGGESTIONS, 7)).toEqual(shuffle(SUGGESTIONS, 7));
  });

  it("gives a different order for a different seed", () => {
    const a = shuffle(SUGGESTIONS, 1).map((s) => s.label);
    const b = shuffle(SUGGESTIONS, 2).map((s) => s.label);
    expect(a).not.toEqual(b);
  });

  it("does not mutate the input", () => {
    const before = [...SUGGESTIONS];
    shuffle(SUGGESTIONS, 3);
    expect(SUGGESTIONS).toEqual(before);
  });
});
