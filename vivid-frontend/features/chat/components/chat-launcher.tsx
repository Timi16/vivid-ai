"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ChatComposer } from "@/features/chat/components/chat-composer";
import { SUGGESTIONS, shuffle } from "@/features/chat/lib/suggestions";
import { backend } from "@/lib/backend/client";
import { cn } from "@/lib/utils";

interface ChatLauncherProps {
  // True until the user has a single chat. The route knows (history does);
  // the launcher only decides how to welcome them.
  isFirstRun?: boolean;
}

// The empty state: wordmark, composer, starter prompts. Submitting creates a
// chat on the backend, stashes the prompt, and lands in the thread — which
// sends it the moment it mounts.
export function ChatLauncher({ isFirstRun = false }: ChatLauncherProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [seed, setSeed] = useState(1);
  const [creating, setCreating] = useState(false);
  const [language, setLanguage] = useState("en");
  const [pendingImage, setPendingImage] = useState<{
    id: string;
    filename: string | null;
    url?: string | null;
  } | null>(null);

  const visible = shuffle(SUGGESTIONS, seed).slice(0, 4);

  // Uploads happen before any chat exists — the attachment is created
  // unbound and the first message claims it by id.
  async function attachFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("Only images can be attached");
      return;
    }
    try {
      const uploaded = await backend.upload(file);
      setPendingImage({ id: uploaded.id, filename: uploaded.filename, url: uploaded.url });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function launch(prompt: string) {
    if (creating) return;
    setCreating(true);
    try {
      const chat = await backend.createChat(language);
      sessionStorage.setItem(
        `vivid-pending-${chat.id}`,
        JSON.stringify({
          text: prompt,
          attachmentId: pendingImage?.id ?? null,
          imageUrl: pendingImage?.url ?? null,
        })
      );
      router.push(`/thread/${chat.id}`);
    } catch (err) {
      setCreating(false);
      toast(err instanceof Error ? err.message : "Could not start a chat");
    }
  }

  // A call needs a thread to live in: create one and let the thread open the
  // call overlay the moment it mounts, mirroring the pending-prompt handoff.
  async function launchCall() {
    if (creating) return;
    setCreating(true);
    try {
      const chat = await backend.createChat(language);
      sessionStorage.setItem(`vivid-pending-call-${chat.id}`, "1");
      router.push(`/thread/${chat.id}`);
    } catch (err) {
      setCreating(false);
      toast(err instanceof Error ? err.message : "Could not start a call");
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col items-center justify-center px-5 py-16">
      <h1 className="ws-display text-fg mb-3 text-[38px] leading-none">
        Vivid <span className="text-fg/45 font-medium">AI</span>
      </h1>
      <p className="text-fg/45 mb-8 text-[14px]">
        {isFirstRun
          ? "Ask anything, in English, Pidgin, Yorùbá or Igbo. Or tap the waveform and just talk."
          : "What can I help with?"}
      </p>

      <ChatComposer
        value={value}
        onValueChange={setValue}
        onSubmit={launch}
        language={language}
        onLanguageChange={setLanguage}
        busy={creating}
        onStartCall={launchCall}
        onAttachFile={attachFile}
        attachment={pendingImage}
        onClearAttachment={() => setPendingImage(null)}
      />

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {visible.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            onClick={() => setValue(suggestion.prompt)}
            className={cn(
              "vd-glass-control vd-sheen cursor-pointer rounded-full px-3.5 py-2",
              "text-fg/75 text-[12.5px] font-medium",
              "hover:border-fg/28 hover:text-fg"
            )}
          >
            {suggestion.label}
          </button>
        ))}

        <button
          type="button"
          aria-label="Show different prompts"
          onClick={() => setSeed((prev) => prev + 1)}
          className="hover:vd-glass-control text-fg/45 hover:text-fg grid size-8 cursor-pointer place-items-center rounded-full transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7h4l8 10h4M4 17h4l2-2.5M14 9.5 16 7h4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="m18 4 2.5 3L18 10M18 14l2.5 3L18 20"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

    </div>
  );
}
