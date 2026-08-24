"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsIndicator, TabsList, TabsTab } from "@/components/ui/tabs";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import {
  BILLING_PLANS,
  priceFor,
  yearlySavingPercent,
  type Cadence,
} from "@/features/billing/lib/plans";

export function UpgradeView({ currentPlanId = "free" }: { currentPlanId?: string }) {
  const [cadence, setCadence] = useState<Cadence>("monthly");

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="ws-display text-fg text-[30px] leading-tight">Upgrade your plan</h1>
        <p className="text-fg/55 max-w-[46ch] text-[13.5px] leading-relaxed font-normal">
          More searches, better models, and the tools for longer work. Cancel at any time.
        </p>

        <Tabs value={cadence} onValueChange={(value) => setCadence(value as Cadence)}>
          <TabsList>
            <TabsTab value="monthly">Monthly</TabsTab>
            <TabsTab value="yearly">Yearly</TabsTab>
            <TabsIndicator />
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-9 grid gap-4 lg:grid-cols-3">
        {BILLING_PLANS.map((plan) => {
          const price = priceFor(plan, cadence);
          const saving = cadence === "yearly" ? yearlySavingPercent(plan) : null;
          const current = plan.id === currentPlanId;

          return (
            <div
              key={plan.id}
              className={cn(
                "vd-glass-card vd-sheen flex flex-col gap-5 p-6",
                plan.featured && "border-fg/32"
              )}
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-fg text-[15px] font-semibold">{plan.name}</span>
                  {plan.featured ? (
                    <span className="vd-glass-control text-fg/85 rounded-full px-2 py-0.5 text-[10.5px] font-semibold">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className="text-fg/50 text-[12.5px] font-normal">{plan.summary}</p>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="ws-display text-fg text-[32px] leading-none">${price}</span>
                <span className="text-fg/45 text-[12px] font-normal">
                  {price === 0 ? "forever" : "per month"}
                </span>
                {saving ? (
                  <span className="text-up ml-1 text-[11.5px] font-semibold">Save {saving}%</span>
                ) : null}
              </div>

              <Button
                variant={plan.featured ? "primary" : "secondary"}
                fullWidth
                disabled={current}
                onClick={() =>
                  toast("Billing isn't available yet", {
                    description: "Plans go live once the billing service ships.",
                  })
                }
              >
                {current ? "Your current plan" : `Choose ${plan.name}`}
              </Button>

              <ul className="flex flex-col gap-2">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="text-fg/65 flex items-start gap-2.5 text-[12.5px] leading-relaxed font-normal"
                  >
                    <CheckIcon size={14} className="text-fg/40 mt-0.5 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-fg/35 mt-8 text-center text-[11.5px] font-normal">
        Prices shown in USD. Taxes may apply depending on where you are.
      </p>
    </div>
  );
}
