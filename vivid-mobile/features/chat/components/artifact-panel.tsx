import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import {
  Image,
  Linking,
  Modal as NativeModal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Glass } from "@/components/ui/glass";
import { IconButton } from "@/components/ui/icon-button";
import { CloseIcon, CopyIcon, DownloadIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { fileExtension, isPreviewable, type Artifact } from "@/features/chat/lib/artifacts";
import { useTheme } from "@/hooks/use-theme";
import { copyText } from "@/lib/clipboard";
import { RADIUS } from "@/lib/theme";
import { toast } from "@/lib/toast";

interface ArtifactPanelProps {
  artifact: Artifact | null;
  onClose: () => void;
}

// The surface for something the assistant made. On the web it sits beside the
// chat; on a phone it rises over it as a full sheet. Code gets copy, save and
// (for HTML) a sandboxed live preview; files open inline where the OS can
// render them.
export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const open = artifact !== null;
  const previewable = artifact?.kind === "code" && isPreviewable(artifact.language);
  const [view, setView] = useState<"preview" | "code">("preview");
  const showPreview = previewable && view === "preview";

  async function copy() {
    if (artifact?.kind !== "code") return;
    const ok = await copyText(artifact.content);
    toast(ok ? "Copied" : "Couldn't copy");
  }

  // A phone has no downloads folder to drop a file into; the share sheet is
  // how a file leaves the app (Files, AirDrop, mail). Remote files open in
  // the browser, which handles saving.
  async function download() {
    if (!artifact) return;
    if (artifact.kind === "file") {
      await Linking.openURL(artifact.url);
      return;
    }
    try {
      const file = new File(
        Paths.cache,
        `${artifact.title.replace(/[^\w.-]+/g, "-") || "artifact"}.${fileExtension(artifact.language)}`
      );
      file.write(artifact.content);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
      else toast("Sharing isn't available on this device");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the file");
    }
  }

  return (
    <NativeModal
      visible={open}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0,0,0,0.5)", paddingTop: insets.top + 24 },
        ]}
      >
        <Glass
          tier="sheet"
          radius={RADIUS.sheet}
          style={{
            flex: 1,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            overflow: "hidden",
          }}
        >
          {artifact ? (
            <>
              <View
                style={{
                  height: 52,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.fg(0.08),
                }}
              >
                <AppText
                  size={13.5}
                  weight="semibold"
                  tone={0.85}
                  numberOfLines={1}
                  style={{ flex: 1 }}
                >
                  {artifact.title}
                </AppText>
                {previewable ? (
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Chip
                      size="sm"
                      label="Preview"
                      selected={view === "preview"}
                      onPress={() => setView("preview")}
                    />
                    <Chip
                      size="sm"
                      label="Code"
                      selected={view === "code"}
                      onPress={() => setView("code")}
                    />
                  </View>
                ) : null}
                {artifact.kind === "code" ? (
                  <IconButton label="Copy" size={32} onPress={() => void copy()}>
                    <CopyIcon size={15} color={theme.fg(0.6)} />
                  </IconButton>
                ) : null}
                <IconButton label="Download" size={32} onPress={() => void download()}>
                  <DownloadIcon size={15} color={theme.fg(0.6)} />
                </IconButton>
                <IconButton label="Close" size={32} onPress={onClose}>
                  <CloseIcon size={15} color={theme.fg(0.6)} />
                </IconButton>
              </View>

              <View style={{ flex: 1, paddingBottom: insets.bottom }}>
                {artifact.kind === "code" ? (
                  showPreview ? (
                    <WebView
                      originWhitelist={["*"]}
                      source={{ html: artifact.content }}
                      javaScriptEnabled
                      style={{ flex: 1, backgroundColor: "#ffffff" }}
                    />
                  ) : (
                    <ScrollView>
                      <ScrollView horizontal>
                        <AppText
                          mono
                          size={12.5}
                          tone={0.85}
                          lineHeight={20}
                          style={{ padding: 16 }}
                        >
                          {artifact.content}
                        </AppText>
                      </ScrollView>
                    </ScrollView>
                  )
                ) : artifact.mime.startsWith("image/") ? (
                  <Image
                    source={{ uri: artifact.url }}
                    accessibilityLabel={artifact.title}
                    style={{ flex: 1, margin: 12 }}
                    resizeMode="contain"
                  />
                ) : artifact.mime === "application/pdf" ? (
                  <WebView source={{ uri: artifact.url }} style={{ flex: 1 }} />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      padding: 40,
                    }}
                  >
                    <AppText size={36}>📄</AppText>
                    <AppText size={13.5} tone={0.6} align="center">
                      {artifact.title}
                    </AppText>
                    <AppText size={12} tone={0.4}>
                      {artifact.mime}
                    </AppText>
                    <Button size="sm" label="Download" onPress={() => void download()} />
                  </View>
                )}
              </View>
            </>
          ) : null}
        </Glass>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top + 24 }}
        />
      </View>
    </NativeModal>
  );
}
