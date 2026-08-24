export type ThreadKind = "chat" | "image" | "video" | "computer";

export interface HistoryEntry {
  id: string;
  title: string;
  preview: string;
  kind: ThreadKind;
  updatedAt: string;
  space?: string;
  pinned?: boolean;
}

// Placeholder history. There is no sessions endpoint yet; the shape is what a
// real one will return, kept here so the swap is a one-file change.
export const HISTORY: HistoryEntry[] = [
  {
    id: "glass-refraction",
    title: "How does glass refract light?",
    preview: "Light bends when it crosses from one medium into another because its speed changes.",
    kind: "chat",
    updatedAt: "2026-08-23T09:12:00.000Z",
    space: "Optics and materials",
  },
  {
    id: "coating-comparison",
    title: "Anti-reflective coating options",
    preview: "Magnesium fluoride is the cheapest single-layer option, but multi-layer stacks…",
    kind: "chat",
    updatedAt: "2026-08-23T07:48:00.000Z",
    space: "Optics and materials",
  },
  {
    id: "prism-render",
    title: "Render a prism splitting white light",
    preview: "Generated 4 images at 1024×1024.",
    kind: "image",
    updatedAt: "2026-08-22T18:20:00.000Z",
  },
  {
    id: "market-sizing",
    title: "Smart glass market sizing 2026",
    preview: "The global market was valued at roughly $6.7B in 2025, growing at about 12% a year.",
    kind: "chat",
    updatedAt: "2026-08-22T11:02:00.000Z",
    space: "Market research",
  },
  {
    id: "explainer-video",
    title: "Explainer video on total internal reflection",
    preview: "Rendered a 24-second clip at 1080p.",
    kind: "video",
    updatedAt: "2026-08-21T15:35:00.000Z",
  },
  {
    id: "scrape-competitors",
    title: "Collect competitor pricing pages",
    preview: "Visited 14 pages and extracted the pricing tables.",
    kind: "computer",
    updatedAt: "2026-08-20T10:14:00.000Z",
    space: "Market research",
  },
  {
    id: "snell-derivation",
    title: "Derive Snell's law from Fermat's principle",
    preview: "Start from the principle that light takes the path of least time…",
    kind: "chat",
    updatedAt: "2026-08-18T20:05:00.000Z",
  },
  {
    id: "reading-queue",
    title: "Papers on metamaterial lenses",
    preview: "Six papers, sorted by citation count.",
    kind: "chat",
    updatedAt: "2026-08-12T09:41:00.000Z",
    space: "Reading list",
  },
];
