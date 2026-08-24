import { describe, expect, it } from "vitest";

import { canContinue, MIN_INTERESTS, toggleInterest } from "@/features/auth/lib/interests";

describe("toggleInterest", () => {
  it("adds one that is not selected", () => {
    expect(toggleInterest(["finance"], "health")).toEqual(["finance", "health"]);
  });

  it("removes one that is already selected", () => {
    expect(toggleInterest(["finance", "health"], "finance")).toEqual(["health"]);
  });

  it("does not mutate the input", () => {
    const before = ["finance"];
    toggleInterest(before, "health");
    expect(before).toEqual(["finance"]);
  });
});

describe("canContinue", () => {
  it("blocks below the minimum", () => {
    expect(canContinue(["a", "b"])).toBe(false);
  });

  it("allows at the minimum", () => {
    expect(canContinue(Array.from({ length: MIN_INTERESTS }, (_, i) => String(i)))).toBe(true);
  });
});
