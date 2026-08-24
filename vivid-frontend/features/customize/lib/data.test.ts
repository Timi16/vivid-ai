import { describe, expect, it } from "vitest";

import { INSTRUCTIONS_LIMIT, instructionsBudget } from "@/features/customize/lib/data";

describe("instructionsBudget", () => {
  it("reports the full budget for empty text", () => {
    expect(instructionsBudget("")).toEqual({ remaining: INSTRUCTIONS_LIMIT, over: false });
  });

  it("counts down as text is added", () => {
    expect(instructionsBudget("abc").remaining).toBe(INSTRUCTIONS_LIMIT - 3);
  });

  it("is not over at exactly the limit", () => {
    expect(instructionsBudget("x".repeat(INSTRUCTIONS_LIMIT))).toEqual({
      remaining: 0,
      over: false,
    });
  });

  it("goes negative and flags over past the limit", () => {
    expect(instructionsBudget("x".repeat(INSTRUCTIONS_LIMIT + 5))).toEqual({
      remaining: -5,
      over: true,
    });
  });
});
