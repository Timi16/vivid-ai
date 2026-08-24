"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsIndicator, TabsList, TabsTab } from "@/components/ui/tabs";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import {
  BILLING_PLANS,
  COMPARE_GROUPS,
  FAQ,
  priceFor,
  yearlySavingPercent,
  yearlyTotal,
  type BillingPlan,
  type Cadence,
  type CompareValue,
} from "@/features/billing/lib/plans";

// Checkout does not exist yet. The button still does something honest: it
// says so, in the plan's own words, rather than silently doing nothing.
function notYet(plan: BillingPlan) {
  toast(`${plan.name} is almost here`, {
    description: "Checkout opens soon. The app will tell you the moment it does.",
  });
}

export function UpgradeView({ currentPlanId = "free" }: { currentPlanId?: string }) {
  const [cadence, setCadence] = useState<Cadence>("monthly");

  return (
    <div className="mx-auto w-full max-w-[1040px] px-5 py-10">
      <header className="flex flex-col items-center gap-4 text-center">
        <span className="text-fg/40 text-[11.5px] font-semibold tracking-wide uppercase">
          Plans
        </span>
        <h1 className="ws-display text-fg max-w-[18ch] text-[34px] leading-[1.1]">
          Choose the Vivid that fits your day
        </h1>
        <p className="text-fg/55 max-w-[48ch] text-[14px] leading-relaxed font-normal">
          Talk in English, Pidgin, Yorùbá or Igbo. Search, browse, run code and make files. Start
          free, upgrade when you need more room.
        </p>

        <div className="mt-2 flex items-center gap-3">
          <Tabs value={cadence} onValueChange={(value) => setCadence(value as Cadence)}>
            <TabsList>
              <TabsTab value="monthly">Monthly</TabsTab>
              <TabsTab value="yearly">Yearly</TabsTab>
              <TabsIndicator />
            </TabsList>
          </Tabs>
          <Badge tone={cadence === "yearly" ? "up" : "neutral"}>Save 20% yearly</Badge>
        </div>
      </header>

      <div className="mt-10 grid gap-4 lg:grid-cols-3 lg:items-start">
        {BILLING_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cadence={cadence}
            current={plan.id === currentPlanId}
          />
        ))}
      </div>

      <section className="mt-14">
        <h2 className="ws-display text-fg text-center text-[22px]">Compare plans</h2>
        <div className="vd-glass-card vd-sheen mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-fg/8 border-b">
                <th className="text-fg/40 px-5 py-4 text-[11.5px] font-semibold tracking-wide uppercase">
                  Feature
                </th>
                {BILLING_PLANS.map((plan) => (
                  <th
                    key={plan.id}
                    className={cn(
                      "px-4 py-4 text-center text-[13px] font-semibold",
                      plan.featured ? "text-fg" : "text-fg/70"
                    )}
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_GROUPS.map((group) => (
                <CompareGroupRows key={group.title} title={group.title} rows={group.rows} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="ws-display text-fg text-center text-[22px]">Questions, answered</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.question} className="vd-glass-card vd-sheen flex flex-col gap-1.5 p-5">
              <h3 className="text-fg text-[13.5px] font-semibold">{item.question}</h3>
              <p className="text-fg/55 text-[12.5px] leading-relaxed font-normal">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-fg/35 mt-10 text-center text-[11.5px] font-normal">
        Prices in USD. Taxes may apply depending on where you are. Nothing is charged until checkout
        opens.
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  cadence,
  current,
}: {
  plan: BillingPlan;
  cadence: Cadence;
  current: boolean;
}) {
  const price = priceFor(plan, cadence);
  const saving = cadence === "yearly" ? yearlySavingPercent(plan) : null;

  return (
    <div
      className={cn(
        "vd-glass-card vd-sheen relative flex flex-col gap-6 p-6",
        plan.featured && "border-fg/35 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_70px_rgba(0,0,0,0.5)] lg:-mt-3 lg:mb-3"
      )}
    >
      {plan.featured ? (
        <span className="vd-glass-bright absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-semibold">
          Most popular
        </span>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-fg text-[16px] font-semibold">{plan.name}</span>
        <p className="text-fg/50 text-[12.5px] font-normal">{plan.tagline}</p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="ws-display text-fg text-[40px] leading-none">${price}</span>
          <span className="text-fg/45 text-[12.5px] font-normal">
            {plan.monthly === 0 ? "forever" : "/ month"}
          </span>
          {saving ? (
            <span className="text-up ml-1 text-[11.5px] font-semibold">Save {saving}%</span>
          ) : null}
        </div>
        <span className="text-fg/40 text-[11.5px] font-normal">
          {plan.monthly === 0
            ? "No card needed"
            : cadence === "yearly"
              ? `$${yearlyTotal(plan)} billed once a year`
              : "Billed monthly, cancel any time"}
        </span>
      </div>

      <Button
        variant={plan.featured ? "primary" : "secondary"}
        size="lg"
        fullWidth
        disabled={current}
        onClick={() => notYet(plan)}
      >
        {current ? "Your current plan" : plan.cta}
      </Button>

      <div className="flex flex-col gap-2.5">
        {plan.inherits ? (
          <span className="text-fg/45 text-[11.5px] font-semibold tracking-wide uppercase">
            {plan.inherits}
          </span>
        ) : null}
        <ul className="flex flex-col gap-2">
          {plan.features.map((feature) => (
            <li
              key={feature}
              className="text-fg/70 flex items-start gap-2.5 text-[13px] leading-relaxed font-normal"
            >
              <span className="bg-fg/10 mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full">
                <CheckIcon size={11} className="text-fg/80" />
              </span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CompareGroupRows({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; values: CompareValue[] }[];
}) {
  return (
    <>
      <tr>
        <td
          colSpan={BILLING_PLANS.length + 1}
          className="text-fg/40 px-5 pt-5 pb-1.5 text-[11px] font-semibold tracking-wide uppercase"
        >
          {title}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-fg/6 border-b last:border-b-0">
          <td className="text-fg/75 px-5 py-2.5 font-normal">{row.label}</td>
          {row.values.map((value, index) => (
            <td key={index} className="px-4 py-2.5 text-center">
              <CompareCell value={value} strong={BILLING_PLANS[index]?.featured} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function CompareCell({ value, strong }: { value: CompareValue; strong?: boolean }) {
  if (value === true) {
    return (
      <span className="bg-fg/10 inline-grid size-5 place-items-center rounded-full">
        <CheckIcon size={12} className="text-fg/85" />
      </span>
    );
  }
  if (value === false) return <span className="text-fg/20">·</span>;
  return (
    <span className={cn("text-[12.5px] font-medium", strong ? "text-fg" : "text-fg/65")}>
      {value}
    </span>
  );
}
