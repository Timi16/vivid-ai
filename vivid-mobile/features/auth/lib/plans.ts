export interface Plan {
  id: "free" | "pro" | "pro_plus";
  name: string;
  price: string;
  cadence: string;
  summary: string;
  features: string[];
  // The one the page leads with.
  featured?: boolean;
}

// The same three plans as the upgrade page, trimmed to what fits an
// onboarding step. Prices are placeholders: there is no billing service yet,
// so nothing here is charged and no plan is persisted.
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    summary: "Try Vivid, for as long as you like.",
    features: [
      "Chat in 4 languages",
      "30 voice minutes a month",
      "Web search and live rates",
      "5 file conversions a day",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$20",
    cadence: "per month",
    summary: "For everyday work, at full speed.",
    featured: true,
    features: [
      "Unlimited voice calls",
      "Priority responses",
      "Browse websites and run code",
      "Unlimited files and exports",
    ],
  },
  {
    id: "pro_plus",
    name: "Pro Plus",
    price: "$100",
    cadence: "per month",
    summary: "For heavy, all-day use.",
    features: [
      "Everything in Pro",
      "5x usage limits",
      "Computer, for long tasks",
      "Early access and priority support",
    ],
  },
];
