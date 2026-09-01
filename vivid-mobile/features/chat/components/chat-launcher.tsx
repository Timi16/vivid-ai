import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Chip } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { ShuffleIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import { ChatComposer } from "@/features/chat/components/chat-composer";
import { stashPendingCall, stashPendingPrompt } from "@/features/chat/lib/handoff";
import { greeting } from "@/features/chat/lib/languages";
import { pickImage } from "@/features/chat/lib/pick-image";
import { SUGGESTIONS, shuffle } from "@/features/chat/lib/suggestions";
import type { PendingImage } from "@/features/chat/lib/types";
import { useTheme } from "@/hooks/use-theme";
import { backend } from "@/lib/backend/client";
import { toast } from "@/lib/toast";

interface ChatLauncherProps {
  // True until the user has a single chat. The route knows (history does);
  // the launcher only decides how to welcome them.
  isFirstRun?: boolean;
}

// The empty state: wordmark, composer, starter prompts. Submitting creates a
// chat on the backend, stashes the prompt, and lands in the thread, which
// sends it the moment it mounts.
export function ChatLauncher({ isFirstRun = false }: ChatLauncherProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [value, setValue] = useState("");
  const [seed, setSeed] = useState(1);
  const [creating, setCreating] = useState(false);
  const [language, setLanguage] = useState("en");
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);

  const visible = shuffle(SUGGESTIONS, seed).slice(0, 4);

  // Uploads happen before any chat exists: the attachment is created
  // unbound and the first message claims it by id.
  async function attachImage() {
    try {
      const file = await pickImage();
      if (!file) return;
      setUploading(true);
      const uploaded = await backend.upload(file);
      setPendingImage({ id: uploaded.id, filename: uploaded.filename, url: uploaded.url });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function launch(prompt: string) {
    if (creating) return;
    setCreating(true);
    try {
      const chat = await backend.createChat(language);
      stashPendingPrompt(chat.id, {
        text: prompt,
        attachmentId: pendingImage?.id ?? null,
        imageUrl: pendingImage?.url ?? null,
      });
      setValue("");
      setPendingImage(null);
      router.replace({ pathname: "/thread/[id]", params: { id: chat.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start a chat");
    } finally {
      setCreating(false);
    }
  }

  // A call needs a thread to live in: create one and let the thread open the
  // call overlay the moment it mounts, mirroring the pending-prompt handoff.
  async function launchCall() {
    if (creating) return;
    setCreating(true);
    try {
      const chat = await backend.createChat(language);
      stashPendingCall(chat.id);
      router.replace({ pathname: "/thread/[id]", params: { id: chat.id } });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start a call");
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", alignItems: "center" }}>
      {/* The product name lives in the top bar now, so the hero line is the
          question rather than the branding. It follows the composer's
          language, which is the clearest way to show the app speaks it. */}
      <AppText display size={32} lineHeight={38} align="center" style={{ marginBottom: 12 }}>
        {greeting(language)}
      </AppText>
      {isFirstRun ? (
        <AppText size={14} tone={0.45} align="center" style={{ marginBottom: 32, maxWidth: 340 }}>
          Ask anything, in English, Pidgin, Yorùbá or Igbo. Or tap the waveform and just talk.
        </AppText>
      ) : (
        <View style={{ height: 20 }} />
      )}

      <View style={{ width: "100%" }}>
        <ChatComposer
          value={value}
          onValueChange={setValue}
          onSubmit={launch}
          language={language}
          onLanguageChange={setLanguage}
          busy={creating}
          onStartCall={launchCall}
          onAttachImage={attachImage}
          attachment={pendingImage}
          attachmentUploading={uploading}
          onClearAttachment={() => setPendingImage(null)}
        />
      </View>

      <View
        style={{
          marginTop: 16,
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {visible.map((suggestion) => (
          <Chip
            key={suggestion.label}
            label={suggestion.label}
            onPress={() => setValue(suggestion.prompt)}
          />
        ))}
        <IconButton
          label="Show different prompts"
          size={32}
          onPress={() => setSeed((prev) => prev + 1)}
        >
          <ShuffleIcon size={16} color={theme.fg(0.45)} />
        </IconButton>
      </View>
    </View>
  );
}
