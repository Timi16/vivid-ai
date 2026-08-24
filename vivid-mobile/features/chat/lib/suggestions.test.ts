import { SUGGESTIONS, shuffle } from "./suggestions";

describe("shuffle", () => {
  it("is a permutation of the input", () => {
    const out = shuffle(SUGGESTIONS, 3);
    expect(out).toHaveLength(SUGGESTIONS.length);
    expect(new Set(out)).toEqual(new Set(SUGGESTIONS));
  });

  it("is deterministic for a seed and different across seeds", () => {
    expect(shuffle(SUGGESTIONS, 1)).toEqual(shuffle(SUGGESTIONS, 1));
    const orders = new Set(
      [1, 2, 3, 4, 5].map((seed) =>
        shuffle(SUGGESTIONS, seed)
          .map((s) => s.label)
          .join("|")
      )
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("does not mutate the input", () => {
    const before = [...SUGGESTIONS];
    shuffle(SUGGESTIONS, 9);
    expect(SUGGESTIONS).toEqual(before);
  });
});
