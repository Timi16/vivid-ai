import { describe, expect, it } from "vitest";

import { progressOf, SAMPLE_TASK, type ComputerTask } from "@/features/computer/lib/data";

function task(states: ("done" | "running" | "pending")[]): ComputerTask {
  return {
    ...SAMPLE_TASK,
    steps: states.map((state, i) => ({
      id: String(i),
      label: "Step",
      detail: "",
      state,
    })),
  };
}

describe("progressOf", () => {
  it("counts only completed steps", () => {
    expect(progressOf(task(["done", "done", "running", "pending"]))).toBe(50);
  });

  it("is zero before anything finishes", () => {
    expect(progressOf(task(["running", "pending"]))).toBe(0);
  });

  it("is complete when every step is done", () => {
    expect(progressOf(task(["done", "done"]))).toBe(100);
  });
});
