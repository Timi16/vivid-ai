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
  COMPARE_GROUPS,
  FAQ,
  priceFor,
  yearlySavingPercent,
  yearlyTotal,
  type BillingPlan,
  type Cadence,
  type CompareValue,
} from "@/features/billing/lib/plans";

const CADENCE_TABS: { value: Cadence; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly, save 20%" },
];

// The web route always renders this with currentPlanId="free". There is no
// billing service yet, so the mobile view fixes it here rather than taking a
// prop nothing would set.
const CURRENT_PLAN_ID: BillingPlan["id"] = "free";

// Checkout does not exist yet. The button still does something honest: it
// says so, in the plan's own words, rather than silently doing nothing.
function notYet(plan: BillingPlan) {
  toast(`${plan.name} is almost here`, {
    description: "Checkout opens soon. The app will tell you the moment it does.",
  });
}

export function UpgradeView() {
  const [cadence, setCadence] = useState<Cadence>("monthly");

  return (
    <View style={{ paddingVertical: 16, gap: 44 }}>
      <View style={{ alignItems: "center", gap: 14 }}>
        <AppText size={11.5} weight="semibold" tone={0.4} uppercase style={{ letterSpacing: 0.6 }}>
          Plans
        </AppText>
        <AppText display size={30} lineHeight={34} align="center" style={{ maxWidth: 320 }}>
          Choose the Vivid that fits your day
        </AppText>
        <AppText
          size={13.5}
          weight="regular"
          tone={0.55}
          align="center"
          lineHeight={21}
          style={{ maxWidth: 340 }}
        >
          Talk in English, Pidgin, Yorùbá or Igbo. Search, browse, run code and make files. Start
          free, upgrade when you need more room.
        </AppText>
        <View style={{ marginTop: 4 }}>
          <Tabs value={cadence} onChange={setCadence} items={CADENCE_TABS} />
        </View>
      </View>

      <View style={{ gap: 18 }}>
        {BILLING_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cadence={cadence}
            current={plan.id === CURRENT_PLAN_ID}
          />
        ))}
      </View>

      <View style={{ gap: 16 }}>
        <AppText display size={22} lineHeight={26} align="center">
          Compare plans
        </AppText>
        <CompareTable />
      </View>

      <View style={{ gap: 16 }}>
        <AppText display size={22} lineHeight={26} align="center">
          Questions, answered
        </AppText>
        <View style={{ gap: 10 }}>
          {FAQ.map((item) => (
            <Glass
              key={item.question}
              tier="card"
              sheen
              blur={false}
              style={{ padding: 18, gap: 6 }}
            >
              <AppText size={13.5} weight="semibold">
                {item.question}
              </AppText>
              <AppText size={12.5} weight="regular" tone={0.55} lineHeight={19}>
                {item.answer}
              </AppText>
            </Glass>
          ))}
        </View>
      </View>

      <AppText size={11.5} weight="regular" tone={0.35} align="center" lineHeight={17}>
        Prices in USD. Taxes may apply depending on where you are. Nothing is charged until checkout
        opens.
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
  const billingNote =
    plan.monthly === 0
      ? "No card needed"
      : cadence === "yearly"
        ? `$${yearlyTotal(plan)} billed once a year`
        : "Billed monthly, cancel any time";

  return (
    <View style={{ paddingTop: plan.featured ? 12 : 0 }}>
      <Glass
        tier="card"
        sheen
        blur={false}
        style={[
          { padding: 22, gap: 20 },
          plan.featured && { borderColor: theme.fg(0.38), shadowOpacity: 0.55 },
        ]}
      >
        {plan.featured ? (
          <View style={{ position: "absolute", top: -12, left: 22 }}>
            <Glass tier="bright" blur={false} style={{ paddingHorizontal: 12, paddingVertical: 5 }}>
              <AppText size={11} weight="semibold" color={theme.colors.ink}>
                Most popular
              </AppText>
            </Glass>
          </View>
        ) : null}

        <View style={{ gap: 4 }}>
          <AppText size={16} weight="semibold">
            {plan.name}
          </AppText>
          <AppText size={12.5} weight="regular" tone={0.5}>
            {plan.tagline}
          </AppText>
        </View>

        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <AppText display size={40} lineHeight={42}>
              ${price}
            </AppText>
            <AppText size={12.5} weight="regular" tone={0.45}>
              {plan.monthly === 0 ? "forever" : "/ month"}
            </AppText>
            {saving ? (
              <AppText
                size={11.5}
                weight="semibold"
                color={theme.colors.up}
                style={{ marginLeft: 4 }}
              >
                Save {saving}%
              </AppText>
            ) : null}
          </View>
          <AppText size={11.5} weight="regular" tone={0.4}>
            {billingNote}
          </AppText>
        </View>

        <Button
          variant={plan.featured ? "primary" : "secondary"}
          size="lg"
          fullWidth
          disabled={current}
          label={current ? "Your current plan" : plan.cta}
          onPress={() => notYet(plan)}
        />

        <View style={{ gap: 10 }}>
          {plan.inherits ? (
            <AppText
              size={11.5}
              weight="semibold"
              tone={0.45}
              uppercase
              style={{ letterSpacing: 0.5 }}
            >
              {plan.inherits}
            </AppText>
          ) : null}
          {plan.features.map((feature) => (
            <View key={feature} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <View
                style={{
                  marginTop: 2,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.fg(0.1),
                }}
              >
                <CheckIcon size={11} color={theme.fg(0.8)} />
              </View>
              <AppText size={13} weight="regular" tone={0.7} lineHeight={20} style={{ flex: 1 }}>
                {feature}
              </AppText>
            </View>
          ))}
        </View>
      </Glass>
    </View>
  );
}

const VALUE_COLUMN = 74;

function CompareTable() {
  const { theme } = useTheme();
  return (
    <Glass tier="card" sheen blur={false} style={{ paddingVertical: 6 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.fg(0.08),
        }}
      >
        <View style={{ flex: 1 }} />
        {BILLING_PLANS.map((plan) => (
          <AppText
            key={plan.id}
            size={12}
            weight="semibold"
            tone={plan.featured ? 1 : 0.65}
            align="center"
            style={{ width: VALUE_COLUMN }}
          >
            {plan.name}
          </AppText>
        ))}
      </View>

      {COMPARE_GROUPS.map((group) => (
        <View key={group.title}>
          <AppText
            size={11}
            weight="semibold"
            tone={0.4}
            uppercase
            style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, letterSpacing: 0.5 }}
          >
            {group.title}
          </AppText>
          {group.rows.map((row) => (
            <View
              key={row.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 9,
              }}
            >
              <AppText
                size={12.5}
                weight="regular"
                tone={0.75}
                style={{ flex: 1, paddingRight: 8 }}
              >
                {row.label}
              </AppText>
              {row.values.map((value, index) => (
                <View key={index} style={{ width: VALUE_COLUMN, alignItems: "center" }}>
                  <CompareCell value={value} strong={Boolean(BILLING_PLANS[index]?.featured)} />
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </Glass>
  );
}

function CompareCell({ value, strong }: { value: CompareValue; strong: boolean }) {
  const { theme } = useTheme();
  if (value === true) {
    return (
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.fg(0.1),
        }}
      >
        <CheckIcon size={12} color={theme.fg(0.85)} />
      </View>
    );
  }
  if (value === false) {
    return (
      <AppText size={14} tone={0.2}>
        ·
      </AppText>
    );
  }
  return (
    <AppText size={11.5} weight="medium" tone={strong ? 1 : 0.65} align="center">
      {value}
    </AppText>
  );
}
