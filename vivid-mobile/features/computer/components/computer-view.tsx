import { useEffect, useState } from "react";
import { Animated, View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Glass } from "@/components/ui/glass";
import { CheckIcon, ComputerIcon, PauseIcon, PlayIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { RADIUS } from "@/lib/theme";
import { ComputerComposer } from "@/features/computer/components/computer-composer";
import {
  progressOf,
  SAMPLE_TASK,
  type StepState,
  type TaskStep,
} from "@/features/computer/lib/data";

// Computer runs a long task in the background and reports what it is doing.
// The step list is the whole product surface: it is how someone decides whether
// to let a run continue.
export function ComputerView() {
  const { theme } = useTheme();
  const task = SAMPLE_TASK;
  const [paused, setPaused] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);

  const progress = progressOf(task);

  return (
    <View style={{ flex: 1 }}>
      <PageHeader
        title="Computer"
        description="Give Vivid a task and it works through it in the background."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              label={paused ? "Resume" : "Pause"}
              icon={paused ? <PlayIcon size={15} /> : <PauseIcon size={15} />}
              onPress={() => setPaused((p) => !p)}
            />
            <Button variant="danger" size="sm" label="Stop" onPress={() => setStopOpen(true)} />
          </>
        }
      />

      <Glass tier="card" sheen style={{ marginTop: 24, padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <Glass
            tier="control"
            radius={13}
            style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
          >
            <ComputerIcon size={18} color={theme.fg(0.75)} />
          </Glass>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText size={14} weight="semibold">
              {task.goal}
            </AppText>
            <AppText size={12} weight="regular" tone={0.45}>
              {paused ? "Paused" : "Running"} · {progress}% complete
            </AppText>
          </View>
        </View>

        <Glass
          tier="well"
          radius={999}
          accessibilityRole="progressbar"
          accessibilityLabel="Task progress"
          accessibilityValue={{ now: progress, min: 0, max: 100 }}
          style={{ marginTop: 16, height: 6, overflow: "hidden" }}
        >
          <View
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius: 999,
              backgroundColor: theme.fg(0.75),
            }}
          />
        </Glass>
      </Glass>

      <View accessibilityRole="list" style={{ marginTop: 20, gap: 8 }}>
        {task.steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </View>

      <View style={{ marginTop: "auto", paddingTop: 32 }}>
        <ComputerComposer />
      </View>

      <ConfirmDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        tone="danger"
        title="Stop this run?"
        description="Work finished so far is kept, but the remaining steps are cancelled."
        confirmLabel="Stop run"
        onConfirm={() => setStopOpen(false)}
      />
    </View>
  );
}

// Spoken alongside the label so the state is not carried by colour alone.
const STATE_LABEL: Record<StepState, string> = {
  done: "done",
  running: "in progress",
  pending: "not started",
};

function StepRow({ step }: { step: TaskStep }) {
  return (
    <Glass
      tier="card"
      sheen
      blur={false}
      radius={RADIUS.row}
      accessibilityLabel={`${step.label} (${STATE_LABEL[step.state]})`}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        padding: 16,
        opacity: step.state === "pending" ? 0.55 : 1,
      }}
    >
      <StepBadge state={step.state} />

      <View style={{ flex: 1, gap: 2 }}>
        <AppText size={13.5} weight="semibold">
          {step.label}
        </AppText>
        <AppText size={12.5} weight="regular" tone={0.5} lineHeight={20}>
          {step.detail}
        </AppText>
      </View>
    </Glass>
  );
}

const BADGE = 24;

function StepBadge({ state }: { state: StepState }) {
  const { theme } = useTheme();
  const box = {
    width: BADGE,
    height: BADGE,
    marginTop: 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  if (state === "done") {
    return (
      <View style={[box, { borderRadius: BADGE / 2, backgroundColor: theme.colors.fg }]}>
        <CheckIcon size={13} color={theme.colors.fgInvert} />
      </View>
    );
  }
  if (state === "running") {
    return (
      <Glass tier="control" radius={BADGE / 2} style={box}>
        <PulsingDot />
      </Glass>
    );
  }
  return <Glass tier="well" radius={BADGE / 2} style={box} />;
}

// The web's animate-pulse: opacity breathing on a two second loop.
function PulsingDot() {
  const { theme } = useTheme();
  // Created once per mount; reading a ref during render trips the hooks lint.
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.fg, opacity }}
    />
  );
}
