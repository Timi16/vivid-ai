export type Cadence = "monthly" | "yearly";
export type PlanId = "free" | "pro" | "pro_plus";

export interface BillingPlan {
  id: PlanId;
  name: string;
  tagline: string;
  monthly: number;
  // Charged per month when billed for a year up front.
  yearly: number;
  cta: string;
  // The plan this one builds on, shown above the feature list.
  inherits?: string;
  features: string[];
  featured?: boolean;
}

// Prices are placeholders until the billing service ships: nothing here is
// charged. The feature lists describe what Vivid does today, so the page
// never promises a tool that does not exist.
export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Try Vivid, for as long as you like.",
    monthly: 0,
    yearly: 0,
    cta: "Start free",
    features: [
      "Chat in English, Pidgin, Yorùbá and Igbo",
      "Voice calls and dictation, 30 minutes a month",
      "Web search, news, weather and live rates",
      "5 file conversions a day",
      "Artifacts kept for 7 days",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For everyday work, at full speed.",
    monthly: 20,
    yearly: 16,
    cta: "Get Pro",
    featured: true,
    inherits: "Everything in Free, plus",
    features: [
      "Unlimited voice calls and dictation",
      "Priority responses, no queue",
      "Browse and read any website",
      "Run code: simulations, charts, data",
      "Unlimited file conversions and exports",
      "Artifacts kept forever",
    ],
  },
  {
    id: "pro_plus",
    name: "Pro Plus",
    tagline: "For heavy, all-day use.",
    monthly: 100,
    yearly: 80,
    cta: "Get Pro Plus",
    inherits: "Everything in Pro, plus",
    features: [
      "5x the usage limits of Pro",
      "Longest memory for long documents and chats",
      "Computer, for long-running tasks",
      "Early access to new models and voices",
      "Priority support",
    ],
  },
];

// A cell in the comparison table: a check, a blank, or a short value.
export type CompareValue = boolean | string;

export interface CompareRow {
  label: string;
  // One value per plan, in BILLING_PLANS order.
  values: [CompareValue, CompareValue, CompareValue];
}

export interface CompareGroup {
  title: string;
  rows: CompareRow[];
}

export const COMPARE_GROUPS: CompareGroup[] = [
  {
    title: "Conversations",
    rows: [
      { label: "Languages", values: ["4", "4", "4"] },
      { label: "Voice minutes", values: ["30 / month", "Unlimited", "Unlimited"] },
      { label: "Priority responses", values: [false, true, true] },
      { label: "Usage limits", values: ["Standard", "High", "5x Pro"] },
    ],
  },
  {
    title: "Tools",
    rows: [
      { label: "Web search and live rates", values: [true, true, true] },
      { label: "Browse websites", values: [false, true, true] },
      { label: "Run code", values: [false, true, true] },
      { label: "Computer", values: [false, false, true] },
    ],
  },
  {
    title: "Files",
    rows: [
      { label: "Conversions per day", values: ["5", "Unlimited", "Unlimited"] },
      { label: "Artifacts kept", values: ["7 days", "Forever", "Forever"] },
      { label: "Export to PDF, Word, Markdown", values: [false, true, true] },
    ],
  },
  {
    title: "Support",
    rows: [
      { label: "Support", values: ["Community", "Email", "Priority"] },
      { label: "Early access to new models", values: [false, false, true] },
    ],
  },
];

export interface Faq {
  question: string;
  answer: string;
}

export const FAQ: Faq[] = [
  {
    question: "Can I cancel any time?",
    answer:
      "Yes. Cancel from Settings and you keep your plan until the end of the period you paid for.",
  },
  {
    question: "What happens to my chats if I downgrade?",
    answer:
      "Nothing is deleted. You keep every chat and artifact; the limits go back to the Free plan on your next billing date.",
  },
  {
    question: "How do I pay?",
    answer:
      "Cards and bank transfer, in naira or dollars. Checkout opens soon, and the app will tell you the moment it does.",
  },
  {
    question: "Is there a student or team price?",
    answer: "Not yet. Tell us what you need from Settings and it will shape what comes next.",
  },
];

export function priceFor(plan: BillingPlan, cadence: Cadence): number {
  return cadence === "monthly" ? plan.monthly : plan.yearly;
}

// What a year costs up front at the yearly rate.
export function yearlyTotal(plan: BillingPlan): number {
  return plan.yearly * 12;
}

// The headline saving, as a whole percentage. Returns null when there is
// nothing to save, so the badge is simply not rendered on the free plan.
export function yearlySavingPercent(plan: BillingPlan): number | null {
  if (plan.monthly === 0) return null;
  const saving = Math.round(((plan.monthly - plan.yearly) / plan.monthly) * 100);
  return saving > 0 ? saving : null;
}
