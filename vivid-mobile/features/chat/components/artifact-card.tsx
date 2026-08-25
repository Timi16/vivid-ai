import { Pressable, View } from "react-native";

import { Glass } from "@/components/ui/glass";
import { GlobeIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

interface ArtifactCardProps {
  title: string;
  // True while the fence is still open in a streaming reply.
  generating?: boolean;
  onPress?: () => void;
}

// What a website looks like inside the conversation: a compact card, not
// three hundred lines of HTML. Opens the artifact panel over the chat.
export function ArtifactCard({ title, generating = false, onPress }: ArtifactCardProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={generating ? "Website being built, open preview" : `Open ${title}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, marginVertical: 10 })}
    >
      <Glass
        tier="card"
        sheen
        blur={false}
        radius={16}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.fg(0.1),
          }}
        >
          {generating ? <Spinner size="small" /> : <GlobeIcon size={19} color={theme.fg(0.85)} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size={13.5} weight="semibold" numberOfLines={1}>
            {generating ? "Building your website…" : title}
          </AppText>
          <AppText size={11.5} weight="regular" tone={0.45}>
            {generating
              ? "Watch it come together in the preview"
              : "Website · HTML · tap to preview"}
          </AppText>
        </View>
        {onPress ? (
          <Glass tier="control" blur={false} style={{ paddingHorizontal: 12, paddingVertical: 5 }}>
            <AppText size={11.5} weight="semibold" tone={0.8}>
              {generating ? "Watch" : "Open"}
            </AppText>
          </Glass>
        ) : null}
      </Glass>
    </Pressable>
  );
}
