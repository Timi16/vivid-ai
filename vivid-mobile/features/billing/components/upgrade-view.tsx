import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { CheckIcon } from "@/components/ui/icons";
import { Tabs } from "@/components/ui/tabs";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { toast } from "@/lib/toast";
import {
  BILLING_PLANS,
  priceFor,
  yearlySavingPercent,
  type BillingPlan,
  type Cadence,
} from "@/features/billing/lib/plans";

const CADENCE_TABS: { value: Cadence; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

// The web route always renders this with currentPlanId="free". There is no
// billing service yet, so the mobile view fixes it here rather than taking a
// prop nothing would set.
const CURRENT_PLAN_ID: BillingPlan["id"] = "free";

export function UpgradeView() {
  const [cadence, setCadence] = useState<Cadence>("monthly");

  return (
    <View style={{ paddingVertical: 20 }}>
      <View style={{ alignItems: "center", gap: 16 }}>
        <AppText display size={30} lineHeight={34} align="center">
          Upgrade your plan
        </AppText>
        <AppText size={13.5} weight="regular" tone={0.55} align="center" lineHeight={22} style={{ maxWidth: 340 }}>
          More searches, better models, and the tools for longer work. Cancel at any time.
        </AppText>

        <Tabs value={cadence} onChange={setCadence} items={CADENCE_TABS} />
      </View>

      <View style={{ marginTop: 36, gap: 16 }}>
        {BILLING_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} cadence={cadence} current={plan.id === CURRENT_PLAN_ID} />
        ))}
      </View>

      <AppText size={11.5} weight="regular" tone={0.35} align="center" style={{ marginTop: 32 }}>
        Prices shown in USD. Taxes may apply depending on where you are.
      </AppText>
    </View>
  );
}

interface PlanCardProps {
  plan: BillingPlan;
  cadence: Cadence;
  current: boolean;
}

function PlanCard({ plan, cadence, current }: PlanCardProps) {
  const { theme } = useTheme();
  const price = priceFor(plan, cadence);
  const saving = cadence === "yearly" ? yearlySavingPercent(plan) : null;

  return (
    <Glass
      tier="card"
      sheen
      blur={false}
      style={[{ padding: 24, gap: 20 }, plan.featured && { borderColor: theme.fg(0.32) }]}
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AppText size={15} weight="semibold">
            {plan.name}
          </AppText>
          {plan.featured ? (
            <Glass tier="control" blur={false} style={{ paddingHorizontal: 8, paddingVertical: 2 }}>
              <AppText size={10.5} weight="semibold" tone={0.85}>
                Most popular
              </AppText>
            </Glass>
          ) : null}
        </View>
        <AppText size={12.5} weight="regular" tone={0.5}>
          {plan.summary}
        </AppText>
      </View>

      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <AppText display size={32} lineHeight={34}>
          ${price}
        </AppText>
        <AppText size={12} weight="regular" tone={0.45}>
          {price === 0 ? "forever" : "per month"}
        </AppText>
        {saving ? (
          <AppText size={11.5} weight="semibold" color={theme.colors.up} style={{ marginLeft: 4 }}>
            Save {saving}%
          </AppText>
        ) : null}
      </View>

      <Button
        variant={plan.featured ? "primary" : "secondary"}
        fullWidth
        disabled={current}
        label={current ? "Your current plan" : `Choose ${plan.name}`}
        onPress={() =>
          toast("Billing isn't available yet", {
            description: "Plans go live once the billing service ships.",
          })
        }
      />

      <View style={{ gap: 8 }}>
        {plan.features.map((feature) => (
          <View key={feature} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View style={{ marginTop: 3 }}>
              <CheckIcon size={14} color={theme.fg(0.4)} />
            </View>
            <AppText size={12.5} weight="regular" tone={0.65} lineHeight={20} style={{ flex: 1 }}>
              {feature}
            </AppText>
          </View>
        ))}
      </View>
    </Glass>
  );
}
