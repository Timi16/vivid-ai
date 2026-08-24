export interface Suggestion {
  label: string;
  prompt: string;
}

// Starter prompts on the empty composer. Each one is something Vivid can
// actually do today: read a page in its browser, run code in the sandbox,
// convert files, check live rates, or search the web.
export const SUGGESTIONS: Suggestion[] = [
  { label: "Read a website", prompt: "Open https://example.com and tell me what it says" },
  { label: "Dollar to naira today", prompt: "What is the dollar to naira rate right now?" },
  { label: "Run a simulation", prompt: "Simulate rolling two dice 10,000 times: how often is the sum 7?" },
  { label: "Convert a file to PDF", prompt: "Convert the image I attach to a PDF" },
  { label: "Weather in Lagos", prompt: "What is the weather in Lagos right now?" },
  { label: "Explain a concept", prompt: "Explain " },
  { label: "Write some code", prompt: "Write a Python script that " },
  { label: "Latest news", prompt: "What is the latest news about " },
];

// Rotate the visible set without repeating. Pure, so the caller decides when it
// runs and the result is testable.
export function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    // Deterministic given the seed, so a re-render does not reorder the chips.
    const j = Math.abs(Math.floor(Math.sin(seed + i) * 10_000)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
