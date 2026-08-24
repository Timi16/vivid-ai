export type StepState = "done" | "running" | "pending";

export interface TaskStep {
  id: string;
  label: string;
  detail: string;
  state: StepState;
}

export interface ComputerTask {
  id: string;
  goal: string;
  startedAt: string;
  steps: TaskStep[];
}

// Placeholder run. There is no agent service yet; this is the shape a real task
// stream will produce, kept in one file so the swap is contained.
export const SAMPLE_TASK: ComputerTask = {
  id: "competitor-pricing",
  goal: "Collect competitor pricing pages and pull out the tables",
  startedAt: "2026-08-23T09:40:00.000Z",
  steps: [
    {
      id: "1",
      label: "Plan the run",
      detail: "Identified 14 competitors to visit from the brief.",
      state: "done",
    },
    {
      id: "2",
      label: "Open each pricing page",
      detail: "Visited 14 pages, 2 needed a cookie banner dismissed.",
      state: "done",
    },
    {
      id: "3",
      label: "Extract the pricing tables",
      detail: "Reading tiers, prices and billing periods.",
      state: "running",
    },
    {
      id: "4",
      label: "Normalise into one table",
      detail: "Convert every price to monthly in USD.",
      state: "pending",
    },
    {
      id: "5",
      label: "Write the summary",
      detail: "Note where a competitor's structure differs.",
      state: "pending",
    },
  ],
};

export function progressOf(task: ComputerTask): number {
  const done = task.steps.filter((step) => step.state === "done").length;
  return Math.round((done / task.steps.length) * 100);
}
