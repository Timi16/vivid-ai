import { Image, Linking, Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { SpeakerIcon } from "@/components/ui/icons";
import { Textarea } from "@/components/ui/input";
import { AppText } from "@/components/ui/text";
import { Markdown } from "@/features/chat/components/markdown";
import { extractHtmlArtifact, type Artifact } from "@/features/chat/lib/artifacts";
import type { LiveMessage, MessageAttachment } from "@/features/chat/lib/types";
import { useTheme } from "@/hooks/use-theme";

interface ImageViewer {
  (image: { url: string; filename: string | null }): void;
}

function AttachedImages({
  attachments,
  onView,
  max,
}: {
  attachments?: MessageAttachment[];
  onView: ImageViewer;
  max: number;
}) {
  const images = attachments?.filter((a) => a.kind === "image" && a.url) ?? [];
  if (!images.length) return null;
  return (
    <>
      {images.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="imagebutton"
          accessibilityLabel="View image full size"
          onPress={() => onView({ url: a.url ?? "", filename: a.filename })}
        >
          <Image
            source={{ uri: a.url ?? "" }}
            style={{ width: max, height: max * 0.9, borderRadius: 12 }}
            resizeMode="cover"
          />
        </Pressable>
      ))}
    </>
  );
}

interface UserBubbleProps {
  message: LiveMessage;
  editing: boolean;
  editingText: string;
  onEditingTextChange: (text: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onViewImage: ImageViewer;
}

// The user's turn sits right in its own bubble, the answer sits left at full
// width, so the two sides of the exchange read apart.
export function UserBubble({
  message,
  editing,
  editingText,
  onEditingTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onViewImage,
}: UserBubbleProps) {
  const editable = !message.id.startsWith("local-");
  return (
    <View style={{ alignItems: "flex-end", gap: 8, paddingLeft: 48 }}>
      <AttachedImages attachments={message.attachments} onView={onViewImage} max={240} />
      {editing ? (
        <Glass tier="card" blur={false} style={{ width: "100%", padding: 12, gap: 8 }}>
          <Textarea
            value={editingText}
            onChangeText={onEditingTextChange}
            autoFocus
            rows={Math.min(6, editingText.split("\n").length + 1)}
          />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" size="sm" label="Cancel" onPress={onCancelEdit} />
            <Button size="sm" label="Send" disabled={!editingText.trim()} onPress={onSaveEdit} />
          </View>
        </Glass>
      ) : (
        <>
          <Glass
            tier="control"
            radius={18}
            style={{
              maxWidth: "100%",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderBottomRightRadius: 6,
            }}
          >
            <AppText size={15} lineHeight={23}>
              {message.content}
            </AppText>
          </Glass>
          {editable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit message"
              onPress={onStartEdit}
              hitSlop={8}
            >
              <AppText size={11.5} tone={0.35}>
                ✎ Edit
              </AppText>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

interface AssistantBubbleProps {
  message: LiveMessage;
  speaking: boolean;
  onPlay: () => void;
  onViewImage: ImageViewer;
  onOpenArtifact: (artifact: Artifact) => void;
  actions: React.ReactNode;
}

export function AssistantBubble({
  message,
  speaking,
  onPlay,
  onViewImage,
  onOpenArtifact,
  actions,
}: AssistantBubbleProps) {
  const { theme } = useTheme();
  // The stored copy of a website already shows as the card in the markdown;
  // listing the .html again would be the same thing twice.
  const hasSite = extractHtmlArtifact(message.content) !== null;
  const files =
    message.attachments?.filter(
      (a) => a.kind === "file" && a.url && !(hasSite && a.mime === "text/html")
    ) ?? [];
  return (
    <View style={{ gap: 14 }}>
      <AttachedImages attachments={message.attachments} onView={onViewImage} max={300} />
      <Markdown onOpenArtifact={onOpenArtifact}>{message.content}</Markdown>
      {files.map((a) => (
        <Glass
          key={a.id}
          tier="control"
          radius={12}
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <AppText size={13} tone={0.8} numberOfLines={1} style={{ flexShrink: 1 }}>
            📄 {a.filename ?? "file"}
          </AppText>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() =>
              onOpenArtifact({
                kind: "file",
                title: a.filename ?? "file",
                url: a.url ?? "",
                mime: a.mime,
              })
            }
          >
            <AppText size={12} weight="semibold" tone={0.55}>
              Open
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => void Linking.openURL(a.url ?? "")}
          >
            <AppText size={12} weight="semibold" tone={0.55}>
              Download
            </AppText>
          </Pressable>
        </Glass>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Button
          variant="secondary"
          size="sm"
          label={speaking ? "Preparing…" : "Play reply"}
          icon={<SpeakerIcon size={14} color={theme.fg(0.7)} />}
          disabled={speaking}
          onPress={onPlay}
        />
        {message.usedTools ? (
          <AppText size={11.5} tone={0.4}>
            ⚙ used tools
          </AppText>
        ) : null}
      </View>
      {actions}
    </View>
  );
}
