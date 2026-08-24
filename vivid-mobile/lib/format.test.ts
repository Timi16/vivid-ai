import { initials, relativeTime, truncate } from "./format";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Mark David Ojukwu")).toBe("MD");
  });
  it("copes with extra spaces and a single name", () => {
    expect(initials("  ada  ")).toBe("A");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("cuts on a word boundary when one is close enough", () => {
    expect(truncate("the quick brown fox jumps", 16)).toBe("the quick brown…");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  it("reads as people say it", () => {
    expect(relativeTime(new Date("2026-08-24T11:59:40Z"), now)).toBe("just now");
    expect(relativeTime(new Date("2026-08-24T11:45:00Z"), now)).toBe("15m ago");
    expect(relativeTime(new Date("2026-08-24T09:00:00Z"), now)).toBe("3h ago");
    expect(relativeTime(new Date("2026-08-22T12:00:00Z"), now)).toBe("2d ago");
    expect(relativeTime(new Date("2026-08-10T12:00:00Z"), now)).toBe("2w ago");
  });
});
