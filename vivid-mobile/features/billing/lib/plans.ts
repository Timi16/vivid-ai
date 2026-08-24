export type Cadence = "monthly" | "yearly";

export interface BillingPlan {
  id: "free" | "pro" | "max";
  name: string;
  summary: string;
  monthly: number;
  // Charged per month when billed for a year up front.
  yearly: number;
  features: string[];
  featured?: boolean;
}

// Placeholder pricing. There is no billing service, so nothing here is charged.
export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    summary: "Everything you need to get started.",
    monthly: 0,
    yearly: 0,
    features: [
      "Unlimited quick answers",
      "3 advanced searches a day",
      "Standard model",
      "Web sources",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    summary: "For everyday research and building.",
    monthly: 20,
    yearly: 16,
    featured: true,
    features: [
      "Unlimited advanced searches",
      "Frontier models",
      "Image and video generation",
      "File and document analysis",
      "Spaces and artifacts",
      "Export to PDF, Word and Markdown",
    ],
  },
  {
    id: "max",
    name: "Max",
    summary: "For heavy, sustained work.",
    monthly: 200,
    yearly: 167,
    features: [
      "Everything in Pro",
      "Highest usage limits",
      "Computer, for long-running tasks",
      "Early access to new models",
      "Priority support",
    ],
  },
];

export function priceFor(plan: BillingPlan, cadence: Cadence): number {
  return cadence === "monthly" ? plan.monthly : plan.yearly;
}

// The headline saving, as a whole percentage. Returns null when there is
// nothing to save, so the badge is simply not rendered on the free plan.
export function yearlySavingPercent(plan: BillingPlan): number | null {
  if (plan.monthly === 0) return null;
  const saving = Math.round(((plan.monthly - plan.yearly) / plan.monthly) * 100);
  return saving > 0 ? saving : null;
}
