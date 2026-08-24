export interface Plan {
  id: "free" | "pro" | "max";
  name: string;
  price: string;
  cadence: string;
  summary: string;
  features: string[];
  // The one the page leads with.
  featured?: boolean;
}

// Prices are placeholders. There is no billing service behind this yet, so
// nothing here is charged and no plan is persisted.
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    summary: "Everything you need to get started.",
    features: ["Unlimited quick answers", "3 advanced searches a day", "Standard model", "Web sources"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$20",
    cadence: "per month",
    summary: "For everyday research and building.",
    featured: true,
    features: [
      "Unlimited advanced searches",
      "Frontier models",
      "Image and video generation",
      "File and document analysis",
      "Spaces and artifacts",
    ],
  },
  {
    id: "max",
    name: "Max",
    price: "$200",
    cadence: "per month",
    summary: "For heavy, sustained work.",
    features: [
      "Everything in Pro",
      "Highest usage limits",
      "Computer, for long tasks",
      "Early access to new models",
      "Priority support",
    ],
  },
];
