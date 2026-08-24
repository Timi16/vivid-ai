export interface Space {
  id: string;
  name: string;
  description: string;
  threadCount: number;
  updatedAt: string;
}

// Placeholder spaces. There is no spaces endpoint yet; this is the shape a real
// one will return, kept in one file so the swap is contained.
export const SPACES: Space[] = [
  {
    id: "optics",
    name: "Optics and materials",
    description: "Refraction, coatings, and how light behaves through glass.",
    threadCount: 8,
    updatedAt: "2026-08-23T09:12:00.000Z",
  },
  {
    id: "market-research",
    name: "Market research",
    description: "Competitor teardowns and sizing work.",
    threadCount: 14,
    updatedAt: "2026-08-21T16:40:00.000Z",
  },
  {
    id: "product",
    name: "Product notes",
    description: "Specs, decisions and open questions.",
    threadCount: 5,
    updatedAt: "2026-08-19T11:05:00.000Z",
  },
  {
    id: "reading",
    name: "Reading list",
    description: "Papers and long reads to come back to.",
    threadCount: 21,
    updatedAt: "2026-08-14T08:30:00.000Z",
  },
];
