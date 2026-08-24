import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { AppText } from "@/components/ui/text";
import { ActivityTrail } from "@/features/chat/components/activity-trail";
import { AddToSpaceDialog } from "@/features/chat/components/add-to-space-dialog";
import { AnswerActions } from "@/features/chat/components/answer-actions";
import { ArtifactPanel } from "@/features/chat/components/artifact-panel";
import { CallOverlay } from "@/features/chat/components/call-overlay";
import { ChatComposer } from "@/features/chat/components/chat-composer";
import { ExportDialog } from "@/features/chat/components/export-dialog";
import { FeedbackDialog } from "@/features/chat/components/feedback-dialog";
import { Markdown } from "@/features/chat/components/markdown";
import { AssistantBubble, UserBubble } from "@/features/chat/components/message-bubbles";
import { RenameDialog } from "@/features/chat/components/rename-dialog";
import { ReportDialog } from "@/features/chat/components/report-dialog";
import { ShareDialog } from "@/features/chat/components/share-dialog";
import { ThinkingLine } from "@/features/chat/components/thinking-line";
import { useLiveThread } from "@/features/chat/hooks/use-live-thread";
import { useSession } from "@/features/chat/hooks/use-session";
import type { Artifact } from "@/features/chat/lib/artifacts";
import { takePendingCall, takePendingPrompt } from "@/features/chat/lib/handoff";
import { pickImage } from "@/features/chat/lib/pick-image";
import type { LiveMessage, PendingImage } from "@/features/chat/lib/types";
import { useTheme } from "@/hooks/use-theme";
import { playUrl, playWavBase64, stopPlayback } from "@/lib/backend/audio";
import { backend } from "@/lib/backend/client";
import { preferences } from "@/lib/storage";
import { toast } from "@/lib/toast";

interface ThreadViewProps {
  sessionId: string;
  // Spaces come from the route, so chat never imports the spaces slice.
  spaces: { id: string; name: string; count: number }[];
}

const draftKey = (id: string) => `vivid-draft-${id}`;

export function ThreadView({ sessionId, spaces }: ThreadViewProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: session, isPending, isError, error, refetch } = useSession(sessionId);
  const [title, setTitle] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  // The draft survives leaving the thread: dictating a message and losing it
  // to a stray back-swipe is exactly the failure a draft exists to prevent.
  useEffect(() => {
    let cancelled = false;
    void preferences.get(draftKey(sessionId)).then((stored) => {
      if (!cancelled && stored) setPrompt((current) => current || stored);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
  const updatePrompt = useCallback(
    (value: string) => {
      setPrompt(value);
      if (value) void preferences.set(draftKey(sessionId), value);
      else void preferences.remove(draftKey(sessionId));
    },
    [sessionId]
  );

  // Mic transcripts arrive as a draft in the input box: reviewed, edited,
  // then submitted (or simply cleared), never auto-sent.
  const thread = useLiveThread(sessionId, session?.language ?? "en", updatePrompt);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [ratings, setRatings] = useState<Record<string, "up" | "down">>({});
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [viewerImage, setViewerImage] = useState<{ url: string; filename: string | null } | null>(
    null
  );
  // Something the assistant made, opened over the chat.
  const [artifact, setArtifact] = useState<Artifact | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<"up" | "down" | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const sentPendingRef = useRef(false);

  // The launcher stashes the first prompt (or a pending call) before
  // navigating here; act on it exactly once, as soon as the thread exists.
  useEffect(() => {
    if (sentPendingRef.current || !session) return;
    const pending = takePendingPrompt(sessionId);
    if (pending) {
      sentPendingRef.current = true;
      void thread.send(
        pending.text,
        pending.attachmentId ? [pending.attachmentId] : [],
        pending.imageUrl
      );
      return;
    }
    if (takePendingCall(sessionId)) {
      sentPendingRef.current = true;
      void thread.call.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessionId]);

  const messages = useMemo<LiveMessage[]>(() => {
    let base = session?.messages ?? [];
    // An edit truncated the conversation from this message onward; the
    // frozen snapshot's tail is stale.
    if (thread.truncateFrom) {
      const cut = base.findIndex((m) => m.id === thread.truncateFrom);
      if (cut >= 0) base = base.slice(0, cut);
    }
    const seen = new Set(base.map((m) => m.id));
    return [...base, ...thread.live.filter((m) => !seen.has(m.id))];
  }, [session?.messages, thread.live, thread.truncateFrom]);

  // Reopening mid-turn: the reply finishes and saves server-side seconds
  // after the reload, but the (deliberately frozen) history snapshot
  // predates it. A history that ends on a user message with nothing live
  // means exactly that: poll briefly until the reply lands.
  const recoveryPollsRef = useRef(0);
  useEffect(() => {
    if (!session?.messages.length) return;
    if (thread.busy || thread.live.length) return;
    const last = session.messages[session.messages.length - 1];
    if (last.role !== "user" || recoveryPollsRef.current >= 6) return;
    const timer = setTimeout(() => {
      recoveryPollsRef.current += 1;
      void refetch();
    }, 2000);
    return () => clearTimeout(timer);
  }, [session, thread.busy, thread.live.length, refetch]);

  // Follow the stream only while the reader is already at the bottom, so
  // scrolling up to re-read is never fought by incoming tokens.
  const stickRef = useRef(true);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    stickRef.current = distance < 160;
  }, []);
  useEffect(() => {
    if (stickRef.current) scrollRef.current?.scrollToEnd({ animated: false });
  }, [messages.length, thread.stream, thread.activity.length]);

  async function saveEdit() {
    if (!editingId || !editingText.trim()) return;
    const id = editingId;
    const text = editingText.trim();
    setEditingId(null);
    await thread.edit(id, text);
  }

  async function submit(text: string) {
    updatePrompt("");
    const attachmentIds = pendingImage ? [pendingImage.id] : [];
    const imageUrl = pendingImage?.url;
    setPendingImage(null);
    await thread.send(text, attachmentIds, imageUrl);
  }

  async function playReply(message: LiveMessage) {
    stopPlayback();
    // Streamed voice turns carry their audio inline; anything else plays the
    // stored clip, synthesizing it on the backend the first time.
    if (message.audio?.length) {
      message.audio.forEach(playWavBase64);
      return;
    }
    const clip = message.attachments?.find((a) => a.kind === "audio" && a.url);
    if (clip?.url) {
      playUrl(clip.url);
      return;
    }
    setSpeakingId(message.id);
    try {
      const spoken = await backend.speakMessage(sessionId, message.id);
      playUrl(spoken.url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not play this reply");
    } finally {
      setSpeakingId(null);
    }
  }

  async function attachImage() {
    try {
      const file = await pickImage();
      if (!file) return;
      setUploading(true);
      const uploaded = await backend.upload(file, sessionId);
      setPendingImage({ id: uploaded.id, filename: uploaded.filename, url: uploaded.url });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (isPending) {
    return (
      <View style={{ padding: 20, paddingTop: 40 }}>
        <AsyncLoading rows={4} />
      </View>
    );
  }

  if (isError || !session) {
    return (
      <View style={{ padding: 20, paddingTop: 40 }}>
        <AsyncError error={error} subject="this thread" onRetry={() => refetch()} />
      </View>
    );
  }

  const heading = title ?? session.title;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 }}
      >
        <AppText display size={24} lineHeight={28}>
          {heading}
        </AppText>

        <View style={{ marginTop: 32, gap: 32 }}>
          {messages.map((message) =>
            message.role === "user" ? (
              <UserBubble
                key={message.id}
                message={message}
                editing={editingId === message.id}
                editingText={editingText}
                onEditingTextChange={setEditingText}
                onStartEdit={() => {
                  setEditingId(message.id);
                  setEditingText(message.content);
                }}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => void saveEdit()}
                onViewImage={setViewerImage}
              />
            ) : (
              <AssistantBubble
                key={message.id}
                message={message}
                speaking={speakingId === message.id}
                onPlay={() => void playReply(message)}
                onViewImage={setViewerImage}
                onOpenArtifact={setArtifact}
                actions={
                  <AnswerActions
                    answer={message.content}
                    rating={ratings[message.id] ?? null}
                    onRate={(rating) => {
                      setRatings((prev) => ({ ...prev, [message.id]: rating }));
                      setFeedbackFor(rating);
                    }}
                    onShare={() => setShareOpen(true)}
                    onExport={() => setExportOpen(true)}
                    onRename={() => setRenameOpen(true)}
                    onAddToSpace={() => setSpaceOpen(true)}
                    onReport={() => setReportOpen(true)}
                    onDelete={() => setDeleteOpen(true)}
                  />
                }
              />
            )
          )}

          <ActivityTrail steps={thread.activity} busy={thread.busy} />

          {thread.stream ? <Markdown>{thread.stream}</Markdown> : null}
          {thread.busy && !thread.stream && !thread.activity.length ? <ThinkingLine /> : null}
          {thread.error ? (
            <Pressable accessibilityRole="button" onPress={thread.dismissError}>
              <AppText size={13.5} color={theme.colors.down}>
                {thread.error}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {/* The composer sits under the thread rather than floating over it, so
          a long answer is never hidden behind it. */}
      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 12, paddingTop: 8 }}>
        <ChatComposer
          value={prompt}
          onValueChange={updatePrompt}
          onSubmit={submit}
          language={session.language}
          busy={thread.busy}
          onCancel={thread.cancel}
          onAttachImage={attachImage}
          attachment={pendingImage}
          attachmentUploading={uploading}
          onClearAttachment={() => setPendingImage(null)}
          recording={thread.recording}
          transcribing={thread.transcribing}
          onToggleMic={thread.toggleMic}
          onStartCall={thread.call.start}
        />
      </View>

      <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />

      <CallOverlay
        open={thread.call.open}
        state={thread.call.state}
        line={thread.call.line}
        onSendNow={thread.call.sendNow}
        onEnd={thread.call.end}
      />

      <Modal
        open={viewerImage !== null}
        onOpenChange={(open) => {
          if (!open) setViewerImage(null);
        }}
        title={viewerImage?.filename ?? "Attached image"}
        hideTitle
        bare
      >
        {viewerImage ? (
          <Image
            source={{ uri: viewerImage.url }}
            accessibilityLabel={viewerImage.filename ?? ""}
            style={{ width: "100%", aspectRatio: 1, borderRadius: 14 }}
            resizeMode="contain"
          />
        ) : null}
      </Modal>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} sessionId={session.id} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} sessionTitle={heading} />
      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentTitle={heading}
        onRename={setTitle}
      />
      <AddToSpaceDialog open={spaceOpen} onOpenChange={setSpaceOpen} spaces={spaces} />
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} />
      <FeedbackDialog
        open={feedbackFor !== null}
        onOpenChange={(next) => {
          if (!next) setFeedbackFor(null);
        }}
        rating={feedbackFor}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        title="Delete this thread?"
        description="The thread and its answers are removed. This can't be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          setDeleteOpen(false);
          try {
            await backend.deleteChat(sessionId);
            toast("Thread deleted");
            router.replace("/");
          } catch (err) {
            toast(err instanceof Error ? err.message : "Delete failed");
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}
