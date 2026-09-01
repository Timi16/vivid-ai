// The one websocket per app session, ported from the web: token streaming,
// tool activity, transcripts, spoken audio, attachments and
// supersede-on-send all arrive through here.

import {
  backend,
  getTokens,
  NETWORK_ERROR_MESSAGE,
  SERVICE_UNAVAILABLE_MESSAGE,
  WS_URL,
  type AttachmentOut,
} from "@/lib/backend/client";

export interface ChatEvent {
  type: "token" | "tool_status" | "transcript" | "audio_chunk" | "done" | "truncated" | "error";
  chat_id?: string;
  text?: string;
  message_id?: string | null;
  user_message_id?: string;
  from_message_id?: string;
  code?: string;
  message?: string;
  data?: string;
  final?: boolean;
  draft?: boolean;
  partial?: boolean;
  language?: string;
  used_tools?: boolean;
  cancelled?: boolean;
  superseded?: boolean;
  attachments?: (AttachmentOut & { url: string })[];
}

// An error event carries both a `code` naming what failed and a `message`
// written for whoever reads the server log: "LLM returned 404: {...}", "TTS
// request failed: ...". Those name parts of the system nobody using the app
// has heard of, and quote a response body back at them -- what showed up in
// the thread as "LLM returned 404:". The code says the same thing without the
// internals, so the text comes from here instead.
//
// Codes are absent from this table on purpose when the server's own wording is
// the better one: `step_limit` explains what to do next, and `connection_lost`
// is written here in the first place.
const ERROR_MESSAGES: Record<string, string> = {
  llm_error: SERVICE_UNAVAILABLE_MESSAGE,
  model_unavailable: SERVICE_UNAVAILABLE_MESSAGE,
  tts_failed: "Vivid could not read that reply out. The answer is still here.",
  stt_failed: "Vivid could not make out that recording. Try saying it again.",
  unauthorized: "Your session has expired. Sign in again to carry on.",
};

// What to actually show for an error event. Falls back to the server's wording
// only for codes this does not know, and to a plain sentence when there is no
// wording at all -- never to a bare code, which is no more use than silence.
export function chatErrorMessage(event: ChatEvent): string {
  const known = event.code ? ERROR_MESSAGES[event.code] : undefined;
  return known ?? event.message ?? "Something went wrong. Try again.";
}

type Listener = (event: ChatEvent) => void;

let socket: WebSocket | null = null;
const listeners = new Set<Listener>();

export function onChatEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function chatSocket(): Promise<WebSocket> {
  if (socket && socket.readyState === WebSocket.OPEN) return socket;
  // The cheap authed call refreshes a stale access token before connecting.
  await backend.ensureFreshToken();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?token=${getTokens()?.access_token ?? ""}`);
    let opened = false;
    ws.onopen = () => {
      opened = true;
      resolve(ws);
    };
    ws.onerror = () => reject(new Error(NETWORK_ERROR_MESSAGE));
    ws.onmessage = (raw) => {
      if (typeof raw.data !== "string") return;
      const event = JSON.parse(raw.data) as ChatEvent;
      listeners.forEach((listener) => listener(event));
    };
    ws.onclose = (closeEvent) => {
      if (socket === ws) socket = null;
      // React Native's close event does not always carry wasClean; a normal
      // closure code means the same thing.
      const clean = closeEvent.wasClean ?? closeEvent.code === 1000;
      // A live connection dying uncleanly (network blip, backend restart)
      // must surface, otherwise a turn in flight hangs on "Thinking…" for
      // ever. The hook decides whether anyone was actually waiting.
      if (opened && !clean) {
        listeners.forEach((listener) =>
          listener({
            type: "error",
            code: "connection_lost",
            message: "Connection lost: check your internet and try again.",
          })
        );
      }
    };
    socket = ws;
  });
}

// Drops the socket without an error event, for sign-out.
export function closeChatSocket() {
  const ws = socket;
  socket = null;
  try {
    ws?.close(1000);
  } catch {
    // already gone
  }
}

export async function sendChatMessage(chatId: string, text: string, attachmentIds: string[] = []) {
  const ws = await chatSocket();
  ws.send(
    JSON.stringify({ type: "message", chat_id: chatId, text, attachment_ids: attachmentIds })
  );
}

export async function sendEdit(chatId: string, messageId: string, text: string) {
  const ws = await chatSocket();
  ws.send(JSON.stringify({ type: "edit", chat_id: chatId, message_id: messageId, text }));
}

export function sendCancel(chatId: string) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "cancel", chat_id: chatId }));
  }
}

export async function startAudioTurn(chatId: string, language: string, dictate = false) {
  const ws = await chatSocket();
  ws.send(
    JSON.stringify({
      type: "audio_start",
      chat_id: chatId,
      language,
      mime: "audio/pcm;rate=16000",
      // Dictation gets rolling partial transcripts back while recording.
      dictate,
    })
  );
  return ws;
}

export function sendAudioChunk(buffer: ArrayBuffer) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(buffer);
}

export function endAudioTurn(chatId: string, transcribeOnly = false) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({ type: "audio_end", chat_id: chatId, transcribe_only: transcribeOnly })
    );
  }
}
