import { LinearGradient } from "expo-linear-gradient";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import { Glass } from "@/components/ui/glass";
import { ImageIcon, PlayIcon, WaveformIcon, type IconComponent } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { formatDuration, type Artifact, type ArtifactKind } from "@/features/artifacts/lib/data";

const KIND_ICON: Record<ArtifactKind, IconComponent> = {
  image: ImageIcon,
  video: PlayIcon,
  audio: WaveformIcon,
};

// The web draws the tint at 155deg. Expressed as start and end points on the
// unit square so the gradient runs the same diagonal here.
const TINT_START = { x: 0.289, y: 0.047 };
const TINT_END = { x: 0.711, y: 0.953 };

// The placeholder visual for a generated piece. A gradient rather than a stock
// photo, so nothing on screen pretends to be output the model produced.
export function ArtifactSurface({
  artifact,
  style,
}: {
  artifact: Artifact;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const Icon = KIND_ICON[artifact.kind];
  return (
    <View
      style={[
        {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.fg(0.1),
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[artifact.tint[0], artifact.tint[1]]}
        start={TINT_START}
        end={TINT_END}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <Glass
        tier="control"
        radius={22}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <Icon size={18} color={theme.fg(0.8)} />
      </Glass>
      {artifact.duration ? (
        <Glass
          tier="control"
          style={{ position: "absolute", right: 10, bottom: 10, paddingHorizontal: 8, paddingVertical: 2 }}
        >
          <AppText size={11} weight="semibold" tone={0.85}>
            {formatDuration(artifact.duration)}
          </AppText>
        </Glass>
      ) : null}
    </View>
  );
}

export function ArtifactTile({ artifact, onOpen }: { artifact: Artifact; onOpen: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={artifact.title}
      onPress={onOpen}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.8 : 1 })}
    >
      <Glass tier="card" sheen blur={false} style={{ padding: 12, gap: 12 }}>
        <ArtifactSurface artifact={artifact} style={{ width: "100%", aspectRatio: 4 / 3 }} />
        <View style={{ gap: 2, paddingHorizontal: 4, paddingBottom: 4 }}>
          <AppText size={13} weight="semibold" numberOfLines={1}>
            {artifact.title}
          </AppText>
          <AppText size={11.5} weight="regular" tone={0.45} numberOfLines={1}>
            {artifact.meta}
          </AppText>
        </View>
      </Glass>
    </Pressable>
  );
}
