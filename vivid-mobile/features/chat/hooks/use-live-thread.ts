// The streaming brain of a thread: seeds from the REST history, then layers
// live websocket events on top: token streaming, tool activity, transcripts,
// spoken audio, attachments, supersede-on-send. ThreadView stays a renderer.
// Ported line for line from the web's use-live-thread.ts; the only change is
// that the mic streamer is a hook here because the native recorder is one.

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  isPlaying,
  playWavBase64,
  setPlaybackIdleCallback,
  stopPlayback,
  usePcmStreamer,
} from "@/lib/backend/audio";
import {
  endAudioTurn,
  onChatEvent,
  sendAudioChunk,
  sendCancel,
  sendChatMessage,
  sendEdit,
  startAudioTurn,
  type ChatEvent,
} from "@/lib/backend/ws";
import { pushActivity } from "@/lib/activity";
import { toast } from "@/lib/toast";
import type { LiveMessage } from "@/features/chat/lib/types";

const VAD_THRESHOLD = 0.015;
// A natural end-of-thought pause; shorter risks cutting people off mid-sentence.
const VAD_SILENCE_MS = 1000;

export type CallState = "idle" | "listening" | "thinking" | "speaking";

export function useLiveThread(
  chatId: string,
  language: string,
  // Composer-mic transcripts arrive as editable drafts rather than sending
  // straight away; this hands the text to the input box.
  onDraftTranscript?: (text: string) => void
) {
  const queryClient = useQueryClient();
  const streamer = usePcmStreamer();
  const [live, setLive] = useState<LiveMessage[]>([]);
  const [stream, setStream] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callState, setCallState] = useState<CallState>("idle");
  const [callLine, setCallLine] = useState("");
  // After an edit, history is truncated from this message id onward; the
  // renderer drops the stale tail of the frozen snapshot.
  const [truncateFrom, setTruncateFrom] = useState<string | null>(null);

  const streamingRef = useRef(false);
  const voiceModeRef = useRef<"push" | "call" | null>(null);
  const turnAudioRef = useRef<string[]>([]);
  const callOpenRef = useRef(false);
  const vadRef = useRef<{ voiced: boolean; last: number } | null>(null);
  const chatRef = useRef(chatId);
  const languageRef = useRef(language);
  const onDraftRef = useRef(onDraftTranscript);
  const streamerRef = useRef(streamer);
  // Whether anything is in flight, readable from event handlers.
  const activeRef = useRef(false);
  // Mirror the latest props/state into refs after each render so socket
  // callbacks read current values without re-subscribing.
  useEffect(() => {
    chatRef.current = chatId;
    languageRef.current = language;
    onDraftRef.current = onDraftTranscript;
    streamerRef.current = streamer;
    activeRef.current = busy || transcribing || recording;
  });

  const stopStreamer = useCallback(() => {
    if (!streamingRef.current) return;
    streamingRef.current = false;
    streamerRef.current.stop();
  }, []);

  const finishListening = useCallback(() => {
    stopStreamer();
    setCallState("thinking");
    setBusy(true);
    endAudioTurn(chatRef.current);
  }, [stopStreamer]);

  const endCall = useCallback(() => {
    callOpenRef.current = false;
    setCallOpen(false);
    setCallState("idle");
    setPlaybackIdleCallback(null);
    stopPlayback();
    stopStreamer();
    voiceModeRef.current = null;
    sendCancel(chatRef.current);
  }, [stopStreamer]);

  const startListening = useCallback(async () => {
    if (!callOpenRef.current) return;
    voiceModeRef.current = "call";
    setCallState("listening");
    vadRef.current = { voiced: false, last: 0 };
    try {
      await startAudioTurn(chatRef.current, languageRef.current);
      streamingRef.current = true;
      await streamerRef.current.start((buffer, rms) => {
        sendAudioChunk(buffer);
        const vad = vadRef.current;
        if (!vad) return;
        const now = Date.now();
        if (rms > VAD_THRESHOLD) {
          vad.voiced = true;
          vad.last = now;
        } else if (vad.voiced && now - vad.last > VAD_SILENCE_MS) {
          vadRef.current = null;
          finishListening();
        }
      });
    } catch (err) {
      streamingRef.current = false;
      setError(err instanceof Error ? err.message : "Microphone unavailable");
      endCall();
    }
  }, [finishListening, endCall]);

  const handleEvent = useCallback(
    (event: ChatEvent) => {
      if (event.chat_id && event.chat_id !== chatRef.current) return;
      switch (event.type) {
        case "token":
          setStream((prev) => prev + (event.text ?? ""));
          break;
        case "tool_status":
          setActivity((prev) => [...prev, event.text ?? ""]);
          break;
        case "transcript":
          if (event.draft) {
            // Composer-mic flow: the words land in the input box for the user
            // to edit and submit; nothing has been sent yet. Partials keep
            // arriving while recording; only the final pass ends the
            // transcribing state.
            if (!event.partial) setTranscribing(false);
            onDraftRef.current?.(event.text ?? "");
            break;
          }
          if (event.final) {
            setLive((prev) => [
              ...prev,
              { id: `local-${Date.now()}`, role: "user", content: event.text ?? "" },
            ]);
          }
          if (voiceModeRef.current === "call") {
            setCallLine(event.text ?? "");
            setCallState("thinking");
          }
          break;
        case "audio_chunk":
          if (!event.data) break;
          if (voiceModeRef.current === "call") {
            setCallState("speaking");
            playWavBase64(event.data);
          } else {
            turnAudioRef.current.push(event.data);
          }
          break;
        case "truncated":
          if (event.from_message_id) setTruncateFrom(event.from_message_id);
          break;
        case "done": {
          setStream("");
          setActivity([]);
          setBusy(false);
          const audio = turnAudioRef.current;
          turnAudioRef.current = [];
          // Retro-fill the just-sent user message with its database id so it
          // becomes editable without a reload.
          if (event.user_message_id) {
            setLive((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === "user" && next[i].id.startsWith("local-")) {
                  next[i] = { ...next[i], id: event.user_message_id as string };
                  break;
                }
              }
              return next;
            });
          }
          if (event.message_id && event.text) {
            pushActivity({
              kind: "reply",
              title: "Reply ready",
              detail: (event.text ?? "").slice(0, 90),
              chatId: chatRef.current,
            });
            for (const file of event.attachments ?? []) {
              pushActivity({
                kind: "file",
                title: `Created ${file.filename ?? "a file"}`,
                detail: file.mime,
                chatId: chatRef.current,
              });
            }
            setLive((prev) => [
              ...prev,
              {
                id: event.message_id as string,
                role: "assistant",
                content: event.text ?? "",
                usedTools: event.used_tools,
                audio: audio.length ? audio : undefined,
                attachments: event.attachments?.length ? event.attachments : undefined,
              },
            ]);
          }
          if (voiceModeRef.current === "call" && callOpenRef.current) {
            const resume = () => {
              setPlaybackIdleCallback(null);
              if (callOpenRef.current) void startListening();
            };
            if (isPlaying()) setPlaybackIdleCallback(resume);
            else resume();
          } else {
            voiceModeRef.current = null;
          }
          // Titles are generated in the background; refresh the lists.
          void queryClient.invalidateQueries({ queryKey: ["chats"] });
          break;
        }
        case "error": {
          const lostConnection = event.code === "connection_lost";
          // An idle socket dying (backend restart, phone sleep) is not worth
          // an alarm; it reconnects on the next send. Only shout when someone
          // was actually waiting on this connection.
          if (lostConnection && !activeRef.current && voiceModeRef.current === null) break;
          setStream("");
          setActivity([]);
          setBusy(false);
          setTranscribing(false);
          turnAudioRef.current = [];
          const message = event.message ?? event.code ?? "Something went wrong";
          setError(message);
          toast(message);
          pushActivity({
            kind: "error",
            title: "Something failed",
            detail: message.slice(0, 90),
            chatId: chatRef.current,
          });
          if (voiceModeRef.current === "call" && callOpenRef.current) {
            // Without a connection, re-opening the mic would just loop.
            if (lostConnection) endCall();
            else void startListening();
          } else {
            voiceModeRef.current = null;
          }
          break;
        }
      }
    },
    [queryClient, startListening, endCall]
  );

  useEffect(() => onChatEvent(handleEvent), [handleEvent]);

  const send = useCallback(
    async (text: string, attachmentIds: string[] = [], imageUrl?: string | null) => {
      // Sending while a reply is generating supersedes it server-side.
      setError(null);
      setStream("");
      setActivity([]);
      setBusy(true);
      setLive((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content: text,
          // The sent image shows on the user's bubble immediately, not after
          // some later refetch.
          attachments: imageUrl
            ? [
                {
                  id: `local-img-${Date.now()}`,
                  kind: "image",
                  url: imageUrl,
                  filename: null,
                  mime: "",
                },
              ]
            : undefined,
        },
      ]);
      try {
        await sendChatMessage(chatRef.current, text, attachmentIds);
      } catch (err) {
        setBusy(false);
        const message = err instanceof Error ? err.message : "Send failed";
        setError(message);
        toast(message);
        // The message never left: put the text back in the input so a retry is
        // one tap, not a retype.
        setLive((prev) => prev.filter((m) => m.content !== text || m.role !== "user"));
        onDraftRef.current?.(text);
      }
    },
    []
  );

  const edit = useCallback(async (messageId: string, text: string) => {
    // Claude-style edit: everything from the edited message onward is
    // replaced by a fresh answer to the new text.
    setError(null);
    setStream("");
    setActivity([]);
    setBusy(true);
    setTruncateFrom(messageId);
    setLive((prev) => {
      const index = prev.findIndex((m) => m.id === messageId);
      const kept = index >= 0 ? prev.slice(0, index) : prev;
      return [...kept, { id: `local-${Date.now()}`, role: "user", content: text }];
    });
    try {
      await sendEdit(chatRef.current, messageId, text);
    } catch (err) {
      setBusy(false);
      const message = err instanceof Error ? err.message : "Edit failed";
      setError(message);
      toast(message);
    }
  }, []);

  const cancel = useCallback(() => sendCancel(chatRef.current), []);

  const toggleMic = useCallback(async () => {
    if (recording) {
      // Audio already streamed while speaking; closing the turn asks only for
      // the transcript, which comes back as a draft in the input box.
      stopStreamer();
      setRecording(false);
      setTranscribing(true);
      endAudioTurn(chatRef.current, true);
      return;
    }
    setError(null);
    voiceModeRef.current = "push";
    turnAudioRef.current = [];
    try {
      await startAudioTurn(chatRef.current, languageRef.current, true);
      streamingRef.current = true;
      await streamerRef.current.start((buffer) => sendAudioChunk(buffer));
      setRecording(true);
    } catch (err) {
      streamingRef.current = false;
      voiceModeRef.current = null;
      setError(err instanceof Error ? err.message : "Microphone unavailable");
    }
  }, [recording, stopStreamer]);

  const startCall = useCallback(async () => {
    setError(null);
    setCallLine("");
    setCallOpen(true);
    callOpenRef.current = true;
    await startListening();
  }, [startListening]);

  useEffect(() => () => endCall(), [endCall]);

  return {
    live,
    stream,
    activity,
    busy,
    transcribing,
    error,
    dismissError: () => setError(null),
    send,
    edit,
    truncateFrom,
    cancel,
    recording,
    toggleMic,
    call: {
      open: callOpen,
      state: callState,
      line: callLine,
      start: startCall,
      end: endCall,
      sendNow: finishListening,
    },
  };
}
