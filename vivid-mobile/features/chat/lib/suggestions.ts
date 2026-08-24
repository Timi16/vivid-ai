export interface Suggestion {
  label: string;
  prompt: string;
}

// Starter prompts on the empty composer. Static for now: there is no
// personalisation endpoint, and inventing one would hide that.
export const SUGGESTIONS: Suggestion[] = [
  { label: "Research a market", prompt: "Research the market for " },
  { label: "Build an app", prompt: "Help me build an app that " },
  { label: "Summarise a paper", prompt: "Summarise this paper: " },
  { label: "Create an image", prompt: "Create an image of " },
  { label: "Plan a trip", prompt: "Plan a trip to " },
  { label: "Explain a concept", prompt: "Explain " },
];

// Rotate the visible set without repeating. Pure, so the caller decides when
// it runs and the result is testable.
export function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    // Deterministic given the seed, so a re-render does not reorder the chips.
    const j = Math.abs(Math.floor(Math.sin(seed + i) * 10_000)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
