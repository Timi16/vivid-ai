export type ResponseStyle = "concise" | "balanced" | "detailed";

export const RESPONSE_STYLES: { value: ResponseStyle; label: string; detail: string }[] = [
  { value: "concise", label: "Concise", detail: "Straight to the answer, minimal preamble." },
  { value: "balanced", label: "Balanced", detail: "The answer, with the reasoning that matters." },
  { value: "detailed", label: "Detailed", detail: "Full working, caveats and alternatives." },
];

export interface SourceKind {
  id: string;
  label: string;
  detail: string;
  defaultOn: boolean;
}

export const SOURCE_KINDS: SourceKind[] = [
  { id: "web", label: "Web", detail: "General pages and articles.", defaultOn: true },
  { id: "academic", label: "Academic", detail: "Papers, preprints and journals.", defaultOn: true },
  { id: "news", label: "News", detail: "Reporting from news outlets.", defaultOn: true },
  { id: "forums", label: "Community", detail: "Forums and discussion threads.", defaultOn: false },
  { id: "social", label: "Social", detail: "Posts from social platforms.", defaultOn: false },
];

export const INSTRUCTIONS_LIMIT = 1500;

// Returns how many characters remain, and whether the text is over budget, so
// the counter and the disabled state come from one place.
export function instructionsBudget(text: string) {
  const remaining = INSTRUCTIONS_LIMIT - text.length;
  return { remaining, over: remaining < 0 };
}
