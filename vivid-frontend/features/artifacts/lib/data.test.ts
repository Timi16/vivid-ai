import { describe, expect, it } from "vitest";

import { formatDuration } from "@/features/artifacts/lib/data";

describe("formatDuration", () => {
  it("pads the seconds", () => {
    expect(formatDuration(92)).toBe("1:32");
  });

  it("handles under a minute", () => {
    expect(formatDuration(24)).toBe("0:24");
  });

  it("shows zero at the start", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("floors a fractional position rather than rounding up past the end", () => {
    expect(formatDuration(59.9)).toBe("0:59");
  });

  it("clamps a negative position", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });
});
