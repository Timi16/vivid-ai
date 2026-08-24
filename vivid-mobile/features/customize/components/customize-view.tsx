import { useState } from "react";
import { Pressable, View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { CheckIcon } from "@/components/ui/icons";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { toast } from "@/lib/toast";
import {
  instructionsBudget,
  RESPONSE_STYLES,
  SOURCE_KINDS,
  type ResponseStyle,
} from "@/features/customize/lib/data";

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <AppText size={11.5} weight="semibold" tone={0.4} uppercase style={{ letterSpacing: 0.5 }}>
          {title}
        </AppText>
        {hint ? (
          <AppText size={12} weight="regular" tone={0.45}>
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// The "N left" counter under each instructions box. Turns red once the text
// is over budget, the same moment Save goes disabled.
function BudgetCounter({ remaining, over }: { remaining: number; over: boolean }) {
  const { theme } = useTheme();
  return (
    <AppText
      size={11.5}
      weight="regular"
      color={over ? theme.colors.down : theme.fg(0.35)}
      style={{ alignSelf: "flex-end" }}
    >
      {remaining} left
    </AppText>
  );
}

export function CustomizeView() {
  const { theme } = useTheme();
  const [style, setStyle] = useState<ResponseStyle>("balanced");
  const [about, setAbout] = useState("");
  const [howToAnswer, setHowToAnswer] = useState("");
  const [sources, setSources] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SOURCE_KINDS.map((s) => [s.id, s.defaultOn]))
  );

  const aboutBudget = instructionsBudget(about);
  const answerBudget = instructionsBudget(howToAnswer);
  const canSave = !aboutBudget.over && !answerBudget.over;

  return (
    <View>
      <PageHeader
        title="Customize"
        description="Tell Vivid how you want it to work. This applies to every new thread."
        actions={
          <Button
            size="md"
            label="Save"
            disabled={!canSave}
            onPress={() =>
              toast("Preferences aren't saved yet", {
                description: "This turns on once the profile service ships.",
              })
            }
          />
        }
      />

      <View style={{ marginTop: 28, gap: 28 }}>
        <Group title="Response style">
          {/* The web lays these out three across on wide screens; on a phone
              they stack so the detail line never wraps into a tall card. */}
          <View style={{ gap: 10 }}>
            {RESPONSE_STYLES.map((option) => {
              const on = style === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setStyle(option.value)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                  <Glass tier="card" sheen blur={false} active={on} style={{ padding: 16, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <AppText size={13} weight="semibold">
                        {option.label}
                      </AppText>
                      {on ? (
                        <View style={{ marginLeft: "auto" }}>
                          <CheckIcon size={14} color={theme.colors.fg} />
                        </View>
                      ) : null}
                    </View>
                    <AppText size={11.5} weight="regular" tone={0.5} lineHeight={18}>
                      {option.detail}
                    </AppText>
                  </Glass>
                </Pressable>
              );
            })}
          </View>
        </Group>

        <Group title="About you" hint="What should Vivid know to give you better answers?">
          <View style={{ gap: 8 }}>
            <Textarea
              rows={4}
              accessibilityLabel="About you"
              value={about}
              invalid={aboutBudget.over}
              placeholder="Your role, what you work on, anything it should assume you already know."
              onChangeText={setAbout}
            />
            <BudgetCounter remaining={aboutBudget.remaining} over={aboutBudget.over} />
          </View>
        </Group>

        <Group
          title="How to answer"
          hint="Tone, format, and anything it should always or never do."
        >
          <View style={{ gap: 8 }}>
            <Textarea
              rows={4}
              accessibilityLabel="How to answer"
              value={howToAnswer}
              invalid={answerBudget.over}
              placeholder="For example: lead with the answer, use British spelling, never open with a compliment."
              onChangeText={setHowToAnswer}
            />
            <BudgetCounter remaining={answerBudget.remaining} over={answerBudget.over} />
          </View>
        </Group>

        <Group title="Sources" hint="Where Vivid looks when it searches.">
          <Glass tier="card" sheen style={{ overflow: "hidden" }}>
            {SOURCE_KINDS.map((source, index) => (
              <View
                key={source.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.fg(0.08),
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AppText size={13.5} weight="semibold">
                    {source.label}
                  </AppText>
                  <AppText size={12} weight="regular" tone={0.5}>
                    {source.detail}
                  </AppText>
                </View>
                <Switch
                  checked={sources[source.id]}
                  onCheckedChange={(next) => setSources((prev) => ({ ...prev, [source.id]: next }))}
                  accessibilityLabel={source.label}
                />
              </View>
            ))}
          </Glass>
        </Group>
      </View>
    </View>
  );
}
