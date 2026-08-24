import { useState } from "react";
import { Image, Pressable, TextInput, View } from "react-native";

import { Glass } from "@/components/ui/glass";
import { IconButton } from "@/components/ui/icon-button";
import { ArrowUpIcon, AttachIcon, ChevronDownIcon, CloseIcon, MicIcon, WaveformIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";
import { FONT } from "@/lib/theme";

interface ChatComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  model?: string;
  // Live-integration hooks. All optional so the launcher can render the same
  // composer before a thread exists.
  onAttachImage?: () => void;
  attachment?: { filename: string | null; url?: string | null } | null;
  attachmentUploading?: boolean;
  onClearAttachment?: () => void;
  recording?: boolean;
  transcribing?: boolean;
  onToggleMic?: () => void;
  onStartCall?: () => void;
  busy?: boolean;
  onCancel?: () => void;
}

// The prompt box. Grows with its content up to a cap, then scrolls.
export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  model = "Vivid AI",
  onAttachImage,
  attachment,
  attachmentUploading,
  onClearAttachment,
  recording,
  transcribing,
  onToggleMic,
  onStartCall,
  busy,
  onCancel,
}: ChatComposerProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const canSend = Boolean(value.trim()) && !attachmentUploading;

  function submit() {
    const trimmed = value.trim();
    // Never send while the image is still uploading: the message would go
    // out without it.
    if (!trimmed || attachmentUploading) return;
    onSubmit(trimmed);
  }

  return (
    <Glass tier="card" sheen style={[{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 }, focused && { borderColor: theme.fg(0.25) }]}>
      {attachmentUploading ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Spinner />
          <AppText size={12.5} tone={0.6}>
            Uploading image…
          </AppText>
        </View>
      ) : attachment ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {attachment.url ? <Image source={{ uri: attachment.url }} style={{ width: 32, height: 32, borderRadius: 6 }} /> : null}
          <AppText size={12.5} tone={0.7} numberOfLines={1} style={{ maxWidth: 200 }}>
            {attachment.filename ?? "image"}
          </AppText>
          <AppText size={12.5} tone={0.4}>
            ✓ ready
          </AppText>
          <IconButton label="Remove attachment" size={28} onPress={onClearAttachment}>
            <CloseIcon size={14} color={theme.fg(0.5)} />
          </IconButton>
        </View>
      ) : null}

      <TextInput
        accessibilityLabel="Ask anything"
        value={value}
        onChangeText={onValueChange}
        multiline
        placeholder={recording ? "Listening…" : transcribing ? "Transcribing…" : "Ask anything…"}
        placeholderTextColor={theme.fg(0.4)}
        selectionColor={theme.fg(0.5)}
        keyboardAppearance={theme.mode}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          color: theme.colors.fg,
          fontFamily: FONT.regular,
          fontSize: 15,
          lineHeight: 21,
          maxHeight: 220,
          minHeight: 24,
          paddingTop: 0,
          paddingBottom: 0,
          textAlignVertical: "top",
        }}
      />

      <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
        {onAttachImage ? (
          <IconButton label="Attach an image" size={32} onPress={onAttachImage}>
            <AttachIcon size={18} color={theme.fg(0.55)} />
          </IconButton>
        ) : null}

        <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 }}>
            <AppText size={12.5} tone={0.55}>
              {model}
            </AppText>
            <ChevronDownIcon size={14} color={theme.fg(0.4)} />
          </View>

          {onStartCall ? (
            <IconButton label="Start a voice conversation" size={32} onPress={onStartCall}>
              <WaveformIcon size={17} color={theme.fg(0.55)} />
            </IconButton>
          ) : null}

          {onToggleMic ? (
            <IconButton
              label={recording ? "Stop recording" : "Dictate"}
              size={32}
              variant={recording ? "bright" : "ghost"}
              onPress={onToggleMic}
            >
              <MicIcon size={18} color={recording ? theme.colors.ink : theme.fg(0.55)} />
            </IconButton>
          ) : null}

          {busy && !value.trim() && onCancel ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Stop generating" onPress={onCancel}>
              <Glass tier="bright" sheen style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: theme.colors.ink }} />
              </Glass>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={submit}
              style={{ opacity: canSend ? 1 : 0.35 }}
            >
              <Glass tier="bright" sheen style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
                <ArrowUpIcon size={16} color={theme.colors.ink} />
              </Glass>
            </Pressable>
          )}
        </View>
      </View>
    </Glass>
  );
}
