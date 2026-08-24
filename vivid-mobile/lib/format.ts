// Display formatting. Pure and side-effect free. Identical to the web app's
// lib/format.ts so lists read the same on both.

// Turn "Mark David Ojukwu" into "MD" for avatar fallbacks.
export function initials(name: string, max = 2): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, max)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

// Shorten to a character budget without cutting mid-word where avoidable.
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  const clipped = text.slice(0, length);
  const lastSpace = clipped.lastIndexOf(" ");
  const body = lastSpace > length * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${body.trimEnd()}…`;
}

// "12.4K". Used for counts, never for money.
export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

// Relative time for session lists: "just now", "4m ago", "3d ago".
export function relativeTime(from: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - from.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return from.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
