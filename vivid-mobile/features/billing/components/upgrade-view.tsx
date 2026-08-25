import { useState } from "react";
import {
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
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

// The web route always renders this with currentPlanId="free". There is no
// billing service yet, so the mobile view fixes it here rather than taking a
// prop nothing would set.
const CURRENT_PLAN_ID: BillingPlan["id"] = "free";

// The screen gutter from components/layout/screen, so the pager can bleed
// edge to edge while the rest of the page keeps its margins.
const GUTTER = 20;
const CARD_GAP = 12;

// Checkout does not exist yet. The button still does something honest: it
// says so, in the plan's own words, rather than silently doing nothing.
function notYet(plan: BillingPlan) {
  toast(`${plan.name} is almost here`, {
    description: "Checkout opens soon. The app will tell you the moment it does.",
  });
}

// Phone-first: a short header, one segmented toggle, then the plans as a
// swipeable pager that opens on Pro with its neighbours peeking in. The
// comparison table and the questions fold away until wanted, so the page is
// not a wall on first sight.
export function UpgradeView() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const featuredIndex = Math.max(
    BILLING_PLANS.findIndex((plan) => plan.featured),
    0
  );
  const [page, setPage] = useState(featuredIndex);

  const cardWidth = width - GUTTER * 2 - 28;
  const step = cardWidth + CARD_GAP;
  const sidePadding = (width - cardWidth) / 2;

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(event.nativeEvent.contentOffset.x / step));
  }

  return (
    <View style={{ paddingVertical: 8, gap: 28 }}>
      <View style={{ gap: 8 }}>
        <AppText size={11.5} weight="semibold" tone={0.4} uppercase style={{ letterSpacing: 0.6 }}>
          Plans
        </AppText>
        <AppText display size={26} lineHeight={30}>
          Choose your plan
        </AppText>
        <AppText size={13.5} weight="regular" tone={0.55} lineHeight={20}>
          Start free. Upgrade when you need more voice, more tools and more room.
        </AppText>
      </View>

      <Segmented
        value={cadence}
        onChange={setCadence}
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly", hint: "save 20%" },
        ]}
      />

      <View style={{ marginHorizontal: -GUTTER }}>
        <FlatList
          data={BILLING_PLANS}
          keyExtractor={(plan) => plan.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          initialScrollIndex={featuredIndex}
          getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
          onMomentumScrollEnd={onScrollEnd}
          contentContainerStyle={{ paddingHorizontal: sidePadding, gap: CARD_GAP }}
          renderItem={({ item }) => (
            <View style={{ width: cardWidth }}>
              <PlanCard plan={item} cadence={cadence} current={item.id === CURRENT_PLAN_ID} />
            </View>
          )}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
            marginTop: 14,
          }}
        >
          {BILLING_PLANS.map((plan, index) => (
            <View
              key={plan.id}
              style={{
                width: index === page ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === page ? theme.fg(0.85) : theme.fg(0.2),
              }}
            />
          ))}
        </View>
      </View>

      <Disclosure title="Compare all features">
        <CompareTable />
      </Disclosure>

      <View style={{ gap: 10 }}>
        <AppText size={11.5} weight="semibold" tone={0.4} uppercase style={{ letterSpacing: 0.6 }}>
          Questions
        </AppText>
        {FAQ.map((item) => (
          <Disclosure key={item.question} title={item.question} compact>
            <AppText size={12.5} weight="regular" tone={0.6} lineHeight={19}>
              {item.answer}
            </AppText>
          </Disclosure>
        ))}
      </View>

      <AppText size={11.5} weight="regular" tone={0.35} align="center" lineHeight={17}>
        Prices in USD. Taxes may apply depending on where you are. Nothing is charged until checkout
        opens.
      </AppText>
    </View>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  const { theme } = useTheme();
  return (
    <Glass tier="control" blur={false} style={{ flexDirection: "row", padding: 3 }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.value)}
            style={{ flex: 1 }}
          >
            <View
              style={{
                height: 36,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 6,
                backgroundColor: on ? theme.colors.fg : "transparent",
              }}
            >
              <AppText
                size={13}
                weight="semibold"
                color={on ? theme.colors.fgInvert : theme.fg(0.6)}
              >
                {option.label}
              </AppText>
              {option.hint ? (
                <AppText
                  size={10.5}
                  weight="semibold"
                  color={on ? theme.colors.fgInvert : theme.colors.up}
                  style={{ opacity: on ? 0.7 : 1 }}
                >
                  {option.hint}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </Glass>
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
  const tag = current ? "Current plan" : plan.featured ? "Most popular" : null;

  return (
    <Glass
      tier="card"
      sheen
      blur={false}
      style={[
        { padding: 20, gap: 18, minHeight: 440 },
        plan.featured && { borderColor: theme.fg(0.4), shadowOpacity: 0.55 },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <AppText size={17} weight="semibold">
          {plan.name}
        </AppText>
        {tag ? (
          <Glass
            tier={plan.featured && !current ? "bright" : "control"}
            blur={false}
            style={{ paddingHorizontal: 10, paddingVertical: 4 }}
          >
            <AppText
              size={10.5}
              weight="semibold"
              color={plan.featured && !current ? theme.colors.ink : theme.fg(0.8)}
            >
              {tag}
            </AppText>
          </Glass>
        ) : null}
      </View>
      <AppText size={12.5} weight="regular" tone={0.5} style={{ marginTop: -10 }}>
        {plan.tagline}
      </AppText>

      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <AppText display size={38} lineHeight={40}>
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
              style={{ marginLeft: 2 }}
            >
              Save {saving}%
            </AppText>
          ) : null}
        </View>
        <AppText size={11.5} weight="regular" tone={0.4}>
          {billingNote}
        </AppText>
      </View>

      <View style={{ gap: 9, flex: 1 }}>
        {plan.inherits ? (
          <AppText size={11} weight="semibold" tone={0.45} uppercase style={{ letterSpacing: 0.5 }}>
            {plan.inherits}
          </AppText>
        ) : null}
        {plan.features.map((feature) => (
          <View key={feature} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View
              style={{
                marginTop: 2,
                width: 17,
                height: 17,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.fg(0.1),
              }}
            >
              <CheckIcon size={10} color={theme.fg(0.8)} />
            </View>
            <AppText size={12.5} weight="regular" tone={0.72} lineHeight={19} style={{ flex: 1 }}>
              {feature}
            </AppText>
          </View>
        ))}
      </View>

      <Button
        variant={plan.featured ? "primary" : "secondary"}
        size="lg"
        fullWidth
        disabled={current}
        label={current ? "Your current plan" : plan.cta}
        onPress={() => notYet(plan)}
      />
    </Glass>
  );
}

// A folded section: tap the title to open it. Keeps the long tail of the page
// (the full comparison, the questions) out of the way until wanted.
function Disclosure({
  title,
  compact = false,
  children,
}: {
  title: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Glass tier="card" sheen blur={false} style={{ overflow: "hidden" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((prev) => !prev)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: compact ? 13 : 15,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <AppText size={compact ? 13.5 : 14.5} weight="semibold" style={{ flex: 1 }}>
          {title}
        </AppText>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
          <ChevronDownIcon size={16} color={theme.fg(0.5)} />
        </View>
      </Pressable>
      {open ? (
        <View
          style={{
            paddingHorizontal: compact ? 16 : 0,
            paddingBottom: compact ? 14 : 6,
            borderTopWidth: 1,
            borderTopColor: theme.fg(0.08),
            paddingTop: compact ? 10 : 0,
          }}
        >
          {children}
        </View>
      ) : null}
    </Glass>
  );
}

const VALUE_COLUMN = 72;

function CompareTable() {
  const { theme } = useTheme();
  return (
    <View style={{ paddingVertical: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.fg(0.08),
        }}
      >
        <View style={{ flex: 1 }} />
        {BILLING_PLANS.map((plan) => (
          <AppText
            key={plan.id}
            size={11.5}
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
            style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, letterSpacing: 0.5 }}
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
                paddingVertical: 8,
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
    </View>
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
