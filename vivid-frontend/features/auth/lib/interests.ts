// Offered during onboarding. The topics mirror the discovery nav in the shell,
// so what someone picks here lines up with what the app then shows them.
export interface Interest {
  id: string;
  label: string;
}

export const INTERESTS: Interest[] = [
  { id: "finance", label: "Finance" },
  { id: "health", label: "Health" },
  { id: "academic", label: "Academic" },
  { id: "patents", label: "Patents" },
  { id: "technology", label: "Technology" },
  { id: "design", label: "Design" },
  { id: "travel", label: "Travel" },
  { id: "sports", label: "Sports" },
  { id: "culture", label: "Arts and culture" },
  { id: "science", label: "Science" },
  { id: "business", label: "Business" },
  { id: "cooking", label: "Cooking" },
];

// Enough to personalise without making the step feel like a form.
export const MIN_INTERESTS = 3;

export function toggleInterest(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

export function canContinue(selected: string[]): boolean {
  return selected.length >= MIN_INTERESTS;
}
