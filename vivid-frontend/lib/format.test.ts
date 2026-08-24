import { describe, expect, it } from "vitest";

import { compactNumber, initials, relativeTime, truncate } from "@/lib/format";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Mark David Ojukwu")).toBe("MD");
  });

  it("handles a single name", () => {
    expect(initials("Mark")).toBe("M");
  });

  it("ignores repeated spaces", () => {
    expect(initials("Mark   David")).toBe("MD");
  });

  it("returns an empty string for an empty name", () => {
    expect(initials("")).toBe("");
  });
});

describe("truncate", () => {
  it("leaves a short string alone", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("cuts at a word boundary when one is close enough to the limit", () => {
    expect(truncate("the quick brown fox", 12)).toBe("the quick…");
  });

  it("cuts mid-word when the last space is too far back", () => {
    expect(truncate("a supercalifragilistic word", 12)).toBe("a supercalif…");
  });
});

describe("compactNumber", () => {
  it("shortens thousands", () => {
    expect(compactNumber(12_400)).toBe("12K");
  });

  it("leaves small numbers alone", () => {
    expect(compactNumber(42)).toBe("42");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-08-23T12:00:00Z");

  it("reads as just now under 45 seconds", () => {
    expect(relativeTime(new Date("2026-08-23T11:59:30Z"), now)).toBe("just now");
  });

  it("counts minutes", () => {
    expect(relativeTime(new Date("2026-08-23T11:56:00Z"), now)).toBe("4m ago");
  });

  it("counts hours", () => {
    expect(relativeTime(new Date("2026-08-23T09:00:00Z"), now)).toBe("3h ago");
  });

  it("counts days", () => {
    expect(relativeTime(new Date("2026-08-20T12:00:00Z"), now)).toBe("3d ago");
  });

  it("falls back to a date past a month", () => {
    expect(relativeTime(new Date("2026-06-01T12:00:00Z"), now)).toBe("Jun 1");
  });
});
