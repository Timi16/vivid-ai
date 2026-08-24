import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Glass } from "@/components/ui/glass";
import { CheckIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { AppText } from "@/components/ui/text";
import { AuthCard } from "@/features/auth/components/auth-card";
import { INTERESTS, MIN_INTERESTS, canContinue, toggleInterest } from "@/features/auth/lib/interests";
import { PLANS } from "@/features/auth/lib/plans";
import { validateName } from "@/features/auth/lib/validation";
import { useTheme } from "@/hooks/use-theme";

const STEPS = ["name", "interests", "plan"] as const;
type Step = (typeof STEPS)[number];

// Three steps: who you are, what you follow, which plan. Nothing is persisted,
// because there is no profile endpoint yet. Each step's handler is where that
// call goes when there is one.
export function OnboardingFlow() {
  const router = useRouter();
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [plan, setPlan] = useState<string>("pro");

  const index = STEPS.indexOf(step);

  const eyebrow = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <AppText size={11.5} weight="semibold" tone={0.4} uppercase style={{ letterSpacing: 0.6 }}>
        Step {index + 1} of {STEPS.length}
      </AppText>
      <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= index ? theme.fg(0.7) : theme.fg(0.12) }} />
        ))}
      </View>
    </View>
  );

  if (step === "name") {
    return (
      <AuthCard eyebrow={eyebrow} title="What should we call you?" subtitle="This is how Vivid will address you.">
        <View style={{ gap: 20 }}>
          <Field label="Your name" error={nameError ?? undefined}>
            <Input
              autoFocus
              placeholder="Mark David"
              value={name}
              invalid={Boolean(nameError)}
              autoComplete="name"
              textContentType="name"
              onChangeText={(value) => {
                setName(value);
                if (nameError) setNameError(null);
              }}
              onSubmitEditing={() => {
                const problem = validateName(name);
                setNameError(problem);
                if (!problem) setStep("interests");
              }}
            />
          </Field>
          <Button
            size="lg"
            label="Continue"
            fullWidth
            onPress={() => {
              const problem = validateName(name);
              setNameError(problem);
              if (!problem) setStep("interests");
            }}
          />
        </View>
      </AuthCard>
    );
  }

  if (step === "interests") {
    const ready = canContinue(selected);
    return (
      <AuthCard
        eyebrow={eyebrow}
        title="What are you interested in?"
        subtitle={`Pick at least ${MIN_INTERESTS}. This shapes what Vivid surfaces for you.`}
      >
        <View style={{ gap: 20 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {INTERESTS.map((interest) => {
              const on = selected.includes(interest.id);
              return (
                <Chip
                  key={interest.id}
                  label={interest.label}
                  selected={on}
                  icon={on ? <CheckIcon size={13} color={theme.colors.fg} /> : undefined}
                  onPress={() => setSelected((prev) => toggleInterest(prev, interest.id))}
                />
              );
            })}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <AppText size={12.5} weight="regular" tone={0.45}>
              {selected.length} selected
            </AppText>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button variant="ghost" label="Back" onPress={() => setStep("name")} />
              <Button label="Continue" disabled={!ready} onPress={() => setStep("plan")} />
            </View>
          </View>
        </View>
      </AuthCard>
    );
  }

  return (
    <AuthCard eyebrow={eyebrow} title="Choose your plan" subtitle="Start free and upgrade whenever you need more.">
      <View style={{ gap: 20 }}>
        <View style={{ gap: 12 }}>
          {PLANS.map((option) => {
            const on = plan === option.id;
            return (
              <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setPlan(option.id)}>
                <Glass tier="card" sheen active={on} blur={false} style={{ padding: 20, gap: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <AppText size={14} weight="semibold">
                      {option.name}
                    </AppText>
                    {option.featured ? (
                      <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: theme.fg(0.15) }}>
                        <AppText size={10.5} weight="semibold" tone={0.8}>
                          Popular
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <AppText display size={24}>
                      {option.price}
                    </AppText>
                    <AppText size={11.5} weight="regular" tone={0.45}>
                      {option.cadence}
                    </AppText>
                  </View>
                  <View style={{ gap: 6 }}>
                    {option.features.map((feature) => (
                      <View key={feature} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                        <View style={{ marginTop: 2 }}>
                          <CheckIcon size={13} color={theme.fg(0.4)} />
                        </View>
                        <AppText size={12} weight="regular" tone={0.6} style={{ flex: 1 }}>
                          {feature}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </Glass>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Button variant="ghost" label="Back" onPress={() => setStep("interests")} />
          <Button label="Start using Vivid" onPress={() => router.replace("/sign-in")} />
        </View>
      </View>
    </AuthCard>
  );
}
