"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { ChatComposer } from "@/features/chat/components/chat-composer";
import { AnswerActions } from "@/features/chat/components/answer-actions";
import { AddToSpaceDialog } from "@/features/chat/components/add-to-space-dialog";
import { ActivityTrail } from "@/features/chat/components/activity-trail";
import { ArtifactPanel } from "@/features/chat/components/artifact-panel";
import { ThinkingLine } from "@/features/chat/components/thinking-line";
import { CallOverlay } from "@/features/chat/components/call-overlay";
import { ExportDialog } from "@/features/chat/components/export-dialog";
import { FeedbackDialog } from "@/features/chat/components/feedback-dialog";
import { Markdown } from "@/features/chat/components/markdown";
import { RenameDialog } from "@/features/chat/components/rename-dialog";
import { SpeakerIcon } from "@/components/ui/icons";
import { ReportDialog } from "@/features/chat/components/report-dialog";
import { ShareDialog } from "@/features/chat/components/share-dialog";
import { useLiveThread } from "@/features/chat/hooks/use-live-thread";
import { useSession } from "@/features/chat/hooks/use-session";
import { backend } from "@/lib/backend/client";
import { playUrl, playWavBase64, stopPlayback } from "@/lib/backend/audio";
import { extractHtmlArtifact, type Artifact } from "@/features/chat/lib/artifacts";
import type { LiveMessage } from "@/features/chat/lib/types";
import { useIsMobile } from "@/hooks/use-is-mobile";

function isStoredSite(attachment: { mime: string }, content: string): boolean {
  return attachment.mime === "text/html" && extractHtmlArtifact(content) !== null;
}

interface ThreadViewProps {
  sessionId: string;
  // Spaces come from the route, so chat never imports the spaces slice.
  spaces: { id: string; name: string; count: number }[];
}

export function ThreadView({ sessionId, spaces }: ThreadViewProps) {
  const router = useRouter();
  const { data: session, isPending, isError, error, refetch } = useSession(sessionId);
  const [title, setTitle] = useState<string | null>(null);
  // The draft survives a refresh: dictating a message and losing it to a
  // stray F5 is exactly the failure a draft exists to prevent.
  const [prompt, setPrompt] = useState(() =>
    typeof window === "undefined" ? "" : (sessionStorage.getItem(`vivid-draft-${sessionId}`) ?? "")
  );
  const updatePrompt = (value: string) => {
    setPrompt(value);
    try {
      if (value) sessionStorage.setItem(`vivid-draft-${sessionId}`, value);
      else sessionStorage.removeItem(`vivid-draft-${sessionId}`);
    } catch {
      // storage full/blocked — the draft just won't survive a refresh
    }
  };
  // Mic transcripts arrive as a draft in the input box — reviewed, edited,
  // then submitted (or simply cleared), never auto-sent.
  const thread = useLiveThread(sessionId, session?.language ?? "en", updatePrompt);
  const [pendingImage, setPendingImage] = useState<{
    id: string;
    filename: string | null;
    url?: string | null;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  // Something the assistant made, opened beside the chat (or over it on a
  // phone).
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const isMobile = useIsMobile();

  // A website being built in the live reply. The panel opens by itself the
  // moment the html fence starts, streams the code in, and flips to the
  // preview when the fence closes. Closing the panel mid-build is respected
  // for the rest of that turn.
  const liveSite = useMemo(() => extractHtmlArtifact(thread.stream), [thread.stream]);
  const generating = Boolean(liveSite && !liveSite.complete && thread.busy);
  const dismissedBuildRef = useRef(false);
  useEffect(() => {
    if (!thread.busy) dismissedBuildRef.current = false;
  }, [thread.busy]);
  useEffect(() => {
    if (!liveSite || dismissedBuildRef.current) return;
    setArtifact({ kind: "code", title: liveSite.title, language: "html", content: liveSite.html });
  }, [liveSite]);
  function closeArtifact() {
    if (generating) dismissedBuildRef.current = true;
    setArtifact(null);
  }

  async function saveEdit() {
    if (!editingId || !editingText.trim()) return;
    const id = editingId;
    const text = editingText.trim();
    setEditingId(null);
    await thread.edit(id, text);
  }
  const [ratings, setRatings] = useState<Record<string, "up" | "down">>({});
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [viewerImage, setViewerImage] = useState<{
    url: string;
    filename: string | null;
  } | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<"up" | "down" | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const sentPendingRef = useRef(false);

  // The launcher stashes the first prompt (or a pending call) before
  // navigating here; act on it exactly once, as soon as the thread exists.
  useEffect(() => {
    if (sentPendingRef.current || !session) return;
    const pending = sessionStorage.getItem(`vivid-pending-${sessionId}`);
    if (pending) {
      sessionStorage.removeItem(`vivid-pending-${sessionId}`);
      sentPendingRef.current = true;
      // The launcher stashes JSON ({text, attachmentId, imageUrl}); a bare
      // string is tolerated so an old stash never breaks the first send.
      let text = pending;
      let attachmentIds: string[] = [];
      let imageUrl: string | null = null;
      try {
        const parsed = JSON.parse(pending) as {
          text?: string;
          attachmentId?: string | null;
          imageUrl?: string | null;
        };
        if (typeof parsed.text === "string") {
          text = parsed.text;
          if (parsed.attachmentId) attachmentIds = [parsed.attachmentId];
          imageUrl = parsed.imageUrl ?? null;
        }
      } catch {
        // plain-string stash
      }
      void thread.send(text, attachmentIds, imageUrl);
      return;
    }
    if (sessionStorage.getItem(`vivid-pending-call-${sessionId}`)) {
      sessionStorage.removeItem(`vivid-pending-call-${sessionId}`);
      sentPendingRef.current = true;
      thread.call.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessionId]);

  const messages = useMemo<LiveMessage[]>(() => {
    let base = session?.messages ?? [];
    // An edit truncated the conversation from this message onward — the
    // frozen snapshot's tail is stale.
    if (thread.truncateFrom) {
      const cut = base.findIndex((m) => m.id === thread.truncateFrom);
      if (cut >= 0) base = base.slice(0, cut);
    }
    const seen = new Set(base.map((m) => m.id));
    return [...base, ...thread.live.filter((m) => !seen.has(m.id))];
  }, [session?.messages, thread.live, thread.truncateFrom]);

  // Refreshing mid-turn: the reply finishes and saves server-side seconds
  // after the reload, but the (deliberately frozen) history snapshot predates
  // it. A history that ends on a user message with nothing live means exactly
  // that — poll briefly until the reply lands. Live activity stops the poll,
  // so this can never re-introduce duplicate bubbles.
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

  // Follow the stream only while the reader is already at the bottom, and at
  // most once per frame. Forcing scrollIntoView on every token (~20x/s) made
  // the whole page judder and fought any attempt to scroll up mid-reply.
  const stickRef = useRef(true);
  const rafRef = useRef(0);
  useEffect(() => {
    const node = bottomRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        stickRef.current = entry.isIntersecting;
      },
      // A little slack so being "almost" at the bottom still counts.
      { rootMargin: "0px 0px 160px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!stickRef.current || rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (stickRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
      }
    });
  }, [messages.length, thread.stream, thread.activity.length]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // A code block whose reply also carries a picture or a clip opens with
  // that result as its preview: the code is how it was made, the image is
  // what the reader asked for.
  function openArtifactFrom(message: LiveMessage) {
    return (artifact: Artifact) => {
      const made = message.attachments?.find(
        (a) => (a.kind === "image" || a.kind === "video") && a.url
      );
      if (artifact.kind === "code" && made?.url) {
        setArtifact({
          ...artifact,
          result: { url: made.url, mime: made.mime, title: made.filename ?? artifact.title },
        });
        return;
      }
      setArtifact(artifact);
    };
  }

  async function submit(text: string) {
    updatePrompt("");
    const attachmentIds = pendingImage ? [pendingImage.id] : [];
    const imageUrl = pendingImage?.url;
    setPendingImage(null);
    // Sending is the reader asking to see what comes back: follow the reply
    // even if they had scrolled up to reread something first.
    stickRef.current = true;
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

  async function attachFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("Only images can be attached");
      return;
    }
    setUploading(true);
    try {
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
      <div className="mx-auto w-full max-w-[760px] px-5 py-10">
        <AsyncLoading label="Loading this thread" rows={4} />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-5 py-10">
        <AsyncError
          error={error}
          subject="this thread"
          unconfiguredDetail="Threads go live once the chat service is switched on."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const heading = title ?? session.title;
  const panelOpen = artifact !== null && !isMobile;

  return (
    <div className="flex h-full min-h-full">
      <div className="flex min-h-full min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] flex-1 px-5 pt-8 pb-6">
          <h1 className="ws-display text-fg text-[24px] leading-tight">{heading}</h1>

          <div className="mt-8 flex flex-col gap-8">
            {messages.map((message) =>
              message.role === "user" ? (
                // The user's turn sits right in its own bubble, the answer sits
                // left at full width, so the two sides of the exchange read apart.
                <div key={message.id} className="group flex flex-col items-end gap-2 pl-12">
                  {message.attachments
                    ?.filter((a) => a.kind === "image" && a.url)
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        aria-label="View image full size"
                        onClick={() => setViewerImage({ url: a.url ?? "", filename: a.filename })}
                        className="cursor-zoom-in"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.url ?? ""}
                          alt=""
                          className="max-h-[260px] max-w-[280px] rounded-xl"
                        />
                      </button>
                    ))}
                  {editingId === message.id ? (
                    <div className="vd-glass-card flex w-full flex-col gap-2 p-3">
                      <textarea
                        value={editingText}
                        autoFocus
                        rows={Math.min(6, editingText.split("\n").length + 1)}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void saveEdit();
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="text-fg w-full resize-none bg-transparent text-[15px] outline-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-fg/55 hover:text-fg cursor-pointer rounded-full px-3 py-1.5 text-[12.5px]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          disabled={!editingText.trim()}
                          className="vd-glass-bright cursor-pointer rounded-full px-4 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="vd-glass-control text-fg max-w-full rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed font-medium whitespace-pre-wrap">
                        {message.content}
                      </p>
                      {!message.id.startsWith("local-") ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(message.id);
                            setEditingText(message.content);
                          }}
                          className="text-fg/35 hover:text-fg cursor-pointer text-[11.5px] font-medium opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          ✎ Edit
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <div key={message.id} className="flex flex-col gap-4">
                  {message.attachments
                    ?.filter((a) => a.kind === "image" && a.url)
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        aria-label="View image full size"
                        onClick={() => setViewerImage({ url: a.url ?? "", filename: a.filename })}
                        className="w-fit cursor-zoom-in"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.url ?? ""}
                          alt=""
                          className="max-h-[300px] max-w-[320px] rounded-xl"
                        />
                      </button>
                    ))}
                  {message.attachments
                    ?.filter((a) => a.kind === "video" && a.url)
                    .map((a) => (
                      <video
                        key={a.id}
                        src={a.url ?? ""}
                        controls
                        preload="metadata"
                        className="max-h-[320px] w-fit max-w-[480px] rounded-xl bg-black"
                      />
                    ))}

                  <Markdown onOpenArtifact={openArtifactFrom(message)}>{message.content}</Markdown>

                  {message.attachments
                    // The stored copy of a website already shows as the card
                    // above; listing the .html again would be the same thing twice.
                    ?.filter((a) => a.kind === "file" && a.url && !isStoredSite(a, message.content))
                    .map((a) => (
                      <div
                        key={a.id}
                        className="vd-glass-control flex w-fit items-center gap-3 rounded-xl px-3.5 py-2 text-[13px]"
                      >
                        <span className="text-fg/80 font-medium">📄 {a.filename ?? "file"}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setArtifact({
                              kind: "file",
                              title: a.filename ?? "file",
                              url: a.url ?? "",
                              mime: a.mime,
                            })
                          }
                          className="text-fg/55 hover:text-fg cursor-pointer text-[12px] font-semibold"
                        >
                          Open
                        </button>
                        <a
                          href={a.url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="text-fg/55 hover:text-fg text-[12px] font-semibold"
                        >
                          Download
                        </a>
                      </div>
                    ))}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={speakingId === message.id}
                      onClick={() => void playReply(message)}
                      className="vd-glass-control text-fg/70 hover:text-fg flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] disabled:opacity-50"
                    >
                      <SpeakerIcon size={14} />
                      {speakingId === message.id ? "Preparing…" : "Play reply"}
                    </button>
                    {message.usedTools ? (
                      <span className="text-fg/40 text-[11.5px] font-medium">⚙ used tools</span>
                    ) : null}
                  </div>

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
                </div>
              )
            )}

            <ActivityTrail steps={thread.activity} busy={thread.busy} />

            {thread.stream ? (
              <Markdown onOpenArtifact={setArtifact} generating={generating}>
                {thread.stream}
              </Markdown>
            ) : null}
            {thread.busy && !thread.stream && !thread.activity.length ? <ThinkingLine /> : null}
            {thread.error ? (
              <button
                type="button"
                onClick={thread.dismissError}
                className="text-left text-[13.5px] text-red-500/90"
              >
                {thread.error}
              </button>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* The composer follows the thread rather than floating over it, so a
          long answer is never hidden behind it. */}
        <div className="sticky bottom-0 px-5 pb-6">
          <div className="mx-auto w-full max-w-[760px]">
            <ChatComposer
              value={prompt}
              onValueChange={updatePrompt}
              onSubmit={submit}
              language={session.language}
              busy={thread.busy}
              onCancel={thread.cancel}
              onAttachFile={attachFile}
              attachment={pendingImage}
              attachmentUploading={uploading}
              onClearAttachment={() => setPendingImage(null)}
              recording={thread.recording}
              transcribing={thread.transcribing}
              onToggleMic={thread.toggleMic}
              onStartCall={thread.call.start}
            />
          </div>
        </div>
      </div>

      {panelOpen && artifact ? (
        <ArtifactPanel
          artifact={artifact}
          generating={generating}
          onClose={closeArtifact}
          className="m-4 ml-0 w-[46%] max-w-[720px] min-w-[360px]"
        />
      ) : null}

      <Modal
        open={artifact !== null && isMobile}
        onOpenChange={(open) => {
          if (!open) closeArtifact();
        }}
        title={artifact?.title ?? "Artifact"}
        hideTitle
        size="xl"
        className="h-[85vh] p-0"
      >
        {artifact ? (
          <ArtifactPanel
            artifact={artifact}
            generating={generating}
            onClose={closeArtifact}
            className="h-full"
          />
        ) : null}
      </Modal>

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
        size="xl"
        className="w-fit p-3"
      >
        {viewerImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={viewerImage.url}
            alt={viewerImage.filename ?? ""}
            className="max-h-[80vh] max-w-full rounded-[14px] object-contain"
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
            router.push("/");
          } catch (err) {
            toast(err instanceof Error ? err.message : "Delete failed");
          }
        }}
      />
    </div>
  );
}
