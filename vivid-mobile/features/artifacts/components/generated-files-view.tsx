import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { Glass } from "@/components/ui/glass";
import { Tabs } from "@/components/ui/tabs";
import { AppText } from "@/components/ui/text";
import { VideoPreview } from "@/components/ui/video-preview";
import { useArtifacts } from "@/features/artifacts/hooks/use-artifacts";
import { useTheme } from "@/hooks/use-theme";
import type { ArtifactOut } from "@/lib/backend/client";
import { relativeTime } from "@/lib/format";

type Kind = ArtifactOut["kind"];
type Filter = "all" | Kind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "file", label: "Documents" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
];

const EMPTY: Record<Filter, string> = {
  all: "Nothing here yet. Ask Vivid to convert a file, make a chart, or export a CSV and it will show up here.",
  file: "No documents yet. Ask Vivid to convert a file, make a chart, or export a CSV.",
  image: "No images yet. Ask Vivid to draw or generate a picture and it will show up here.",
  video: "No videos yet. Ask Vivid to generate a short clip and it will show up here.",
};

function iconFor(artifact: ArtifactOut): string {
  if (artifact.mime === "text/html") return "🌐";
  if (artifact.mime === "application/pdf") return "📕";
  if (artifact.mime.startsWith("text/csv")) return "📊";
  if (artifact.mime.startsWith("image/")) return "🖼";
  if (artifact.mime.startsWith("video/")) return "🎬";
  return "📄";
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Preview({ item }: { item: ArtifactOut }) {
  const { theme } = useTheme();
  if (item.kind === "image") {
    return (
      <Image
        source={{ uri: item.url }}
        accessibilityLabel={item.filename ?? ""}
        style={{ height: 144, width: "100%", borderRadius: 8 }}
        resizeMode="cover"
      />
    );
  }
  if (item.kind === "video") {
    return (
      <VideoPreview
        url={item.url}
        accessibilityLabel={item.filename ?? "video"}
        style={{ height: 180, width: "100%", borderRadius: 8, backgroundColor: "#000" }}
      />
    );
  }
  return (
    <View
      style={{
        height: 144,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.fg(0.05),
      }}
    >
      <AppText size={36}>{iconFor(item)}</AppText>
    </View>
  );
}

interface GeneratedFilesViewProps {
  // Pin the screen to one kind (the Images and Videos screens); the Artifacts
  // screen leaves it unset and offers the tabs.
  kind?: Kind;
  title?: string;
  description?: string;
}

// Everything Vivid has made for the user across chats, with a way back to
// the conversation each one came from.
export function GeneratedFilesView({
  kind,
  title = "Artifacts",
  description = "Files, images and video Vivid has generated for you, across every chat.",
}: GeneratedFilesViewProps) {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useArtifacts();
  const [chosen, setChosen] = useState<Filter>("all");
  const filter: Filter = kind ?? chosen;

  const shown = (data ?? []).filter((item) => filter === "all" || item.kind === filter);

  return (
    <View>
      <PageHeader title={title} description={description} />

      {kind ? null : (
        <View style={{ marginTop: 24 }}>
          <Tabs value={filter} onChange={setChosen} items={FILTERS} />
        </View>
      )}

      <View style={{ marginTop: 24, gap: 12 }}>
        {isPending ? <AsyncLoading rows={3} /> : null}
        {isError ? (
          <AsyncError
            error={error}
            subject={`your ${title.toLowerCase()}`}
            onRetry={() => refetch()}
          />
        ) : null}
        {data && shown.length === 0 ? (
          <AppText size={13.5} tone={0.45} align="center" style={{ paddingVertical: 40 }}>
            {EMPTY[filter]}
          </AppText>
        ) : null}
        {shown.map((item) => (
          <Glass key={item.id} tier="card" blur={false} style={{ padding: 16, gap: 12 }}>
            <Preview item={item} />
            <View style={{ gap: 2 }}>
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(item.url)}>
                <AppText size={13.5} weight="semibold" tone={0.9} numberOfLines={1}>
                  {item.filename ?? "file"}
                </AppText>
              </Pressable>
              <AppText size={11.5} tone={0.4}>
                {sizeLabel(item.size_bytes)} · {relativeTime(new Date(item.created_at))}
              </AppText>
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  router.push({ pathname: "/thread/[id]", params: { id: item.chat_id } })
                }
              >
                <AppText size={11.5} tone={0.5} numberOfLines={1}>
                  From: {item.chat_title ?? "a chat"}
                </AppText>
              </Pressable>
            </View>
          </Glass>
        ))}
      </View>
    </View>
  );
}
