import { useState } from "react";
import { View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { CopyIcon, DownloadIcon, ShareIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { copyText } from "@/lib/clipboard";
import { relativeTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ArtifactSurface, ArtifactTile } from "@/features/artifacts/components/artifact-tile";
import { MediaTransport } from "@/features/artifacts/components/media-transport";
import { ARTIFACTS, type Artifact, type ArtifactKind } from "@/features/artifacts/lib/data";

type KindFilter = ArtifactKind | "all";

const FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
];

// The web lays tiles out on a responsive grid. A phone gets two columns, built
// as explicit rows so an odd last tile keeps its width instead of stretching.
function pairs<T>(items: T[]): [T, T | undefined][] {
  const rows: [T, T | undefined][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push([items[i] as T, items[i + 1]]);
  return rows;
}

export function ArtifactsView() {
  const { theme } = useTheme();
  const [kind, setKind] = useState<KindFilter>("all");
  const [open, setOpen] = useState<Artifact | null>(null);

  const artifacts = ARTIFACTS;
  const shown = kind === "all" ? artifacts : artifacts.filter((a) => a.kind === kind);

  return (
    <View>
      <PageHeader
        title="Artifacts"
        description="Everything Vivid has generated for you: images, video and audio."
      />

      <View style={{ marginTop: 24 }}>
        <Tabs value={kind} onChange={setKind} items={FILTERS} />
      </View>

      {shown.length === 0 ? (
        <Glass
          tier="card"
          sheen
          style={{
            marginTop: 24,
            alignItems: "center",
            paddingHorizontal: 20,
            paddingVertical: 64,
          }}
        >
          <View style={{ maxWidth: 320, alignItems: "center", gap: 6 }}>
            <AppText size={14} weight="semibold" tone={0.85} align="center">
              Nothing here yet
            </AppText>
            <AppText size={12.5} weight="regular" tone={0.5} align="center">
              Ask Vivid to generate something and it will show up here.
            </AppText>
          </View>
        </Glass>
      ) : (
        <View style={{ marginTop: 24, gap: 12 }}>
          {pairs(shown).map(([first, second]) => (
            <View key={first.id} style={{ flexDirection: "row", gap: 12 }}>
              <ArtifactTile artifact={first} onOpen={() => setOpen(first)} />
              {second ? (
                <ArtifactTile artifact={second} onOpen={() => setOpen(second)} />
              ) : (
                <View style={{ flex: 1 }} />
              )}
            </View>
          ))}
        </View>
      )}

      <Modal
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        title={open?.title ?? ""}
        description={open ? `${open.meta} · ${relativeTime(new Date(open.createdAt))}` : undefined}
        footer={
          // Wraps so three actions still fit a narrow sheet.
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              label="Copy prompt"
              icon={<CopyIcon size={14} color={theme.fg(0.65)} />}
              onPress={() => {
                void copyText(open?.prompt ?? "").then((ok) => {
                  toast(ok ? "Prompt copied" : "Couldn't copy the prompt");
                });
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              label="Share"
              icon={<ShareIcon size={14} color={theme.fg(0.65)} />}
              onPress={() => toast("Sharing isn't available yet")}
            />
            <Button
              size="sm"
              label="Download"
              icon={<DownloadIcon size={14} color={theme.colors.ink} />}
              onPress={() =>
                toast("Download isn't available yet", {
                  description: "This turns on once the media service ships.",
                })
              }
            />
          </View>
        }
      >
        {open ? (
          <View style={{ gap: 16 }}>
            {open.kind === "image" ? (
              <ArtifactSurface artifact={open} style={{ width: "100%", aspectRatio: 16 / 10 }} />
            ) : (
              <MediaTransport
                duration={open.duration ?? 0}
                visual={
                  open.kind === "video" ? (
                    <ArtifactSurface
                      artifact={open}
                      style={{ width: "100%", aspectRatio: 16 / 9 }}
                    />
                  ) : (
                    <ArtifactSurface artifact={open} style={{ width: "100%", height: 96 }} />
                  )
                }
              />
            )}

            <Glass tier="well" radius={16} style={{ padding: 16 }}>
              <AppText
                size={11.5}
                weight="semibold"
                tone={0.4}
                uppercase
                style={{ letterSpacing: 0.6 }}
              >
                Prompt
              </AppText>
              <AppText
                size={13}
                weight="regular"
                tone={0.7}
                lineHeight={20}
                style={{ marginTop: 6 }}
              >
                {open.prompt}
              </AppText>
            </Glass>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}
