// The live backend client, ported from vivid-frontend/lib/backend/client.ts.
// The phone talks to FastAPI directly over REST and one websocket: one
// transport, one auth story. Tokens live in the device keystore and are
// mirrored in memory so every call site can read them synchronously.

import { useSyncExternalStore } from "react";

import { API_URL } from "@/config/env";
import { secureStorage } from "@/lib/storage";

export const API_BASE = API_URL.replace(/\/$/, "");
export const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";

const TOKEN_KEY = "vivid_tokens";

export interface TokenBundle {
  access_token: string;
  refresh_token: string;
  user?: { id: string; email: string };
}

let tokens: TokenBundle | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

// Reads the keystore once at boot. Everything after that is synchronous.
export async function loadTokens(): Promise<TokenBundle | null> {
  if (loaded) return tokens;
  try {
    const raw = await secureStorage.get(TOKEN_KEY);
    tokens = raw ? (JSON.parse(raw) as TokenBundle) : null;
  } catch {
    tokens = null;
  }
  loaded = true;
  emit();
  return tokens;
}

export function getTokens(): TokenBundle | null {
  return tokens;
}

export function setTokens(next: TokenBundle | null) {
  tokens = next;
  loaded = true;
  emit();
  if (next) void secureStorage.set(TOKEN_KEY, JSON.stringify(next));
  else void secureStorage.remove(TOKEN_KEY);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => tokens;

// The auth gate and the account menu read the session through this, so a
// 401 that clears the tokens moves the whole app to sign-in at once.
export function useAuthTokens(): TokenBundle | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

async function refreshTokens(): Promise<boolean> {
  if (!tokens?.refresh_token) return false;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  setTokens((await res.json()) as TokenBundle);
  return true;
}

interface RequestInitPlus extends RequestInit {
  json?: unknown;
}

// One voice for every network failure: actionable, not "Network request failed".
export const NETWORK_ERROR_MESSAGE =
  "Network problem: check your internet connection and try again.";

// The backend sends a `detail` for every problem it means to explain -- "Chat
// not found", a rejected upload. A failure with no detail is not a problem the
// product is having, it is the service being absent: a route that is not
// there, a gateway with nothing behind it, a model pod that fell over. Those
// arrive as a bare 404 or 5xx, and "Request failed (404)" tells nobody
// anything, least of all whether it is worth trying again.
function serviceMessage(status: number): string {
  if (status === 429) return "Too many requests right now. Give it a moment and try again.";
  if (status === 404 || status >= 500) {
    return "Vivid is unavailable right now. Try again in a moment.";
  }
  return `Request failed (${status})`;
}

async function request<T>(path: string, init: RequestInitPlus = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (tokens) headers.set("Authorization", `Bearer ${tokens.access_token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1${path}`, { ...init, headers, body });
  } catch {
    // fetch only throws for network-level failures (offline, DNS, refused).
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
  if (res.status === 401 && retry) {
    if (await refreshTokens()) return request<T>(path, init, false);
    // Clearing the tokens is the sign-out: the auth gate observes it.
    setTokens(null);
  }
  if (!res.ok) {
    let detail = serviceMessage(res.status);
    try {
      const parsed = (await res.json()) as { detail?: string };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      // no body to explain itself: the status is all there is to go on
    }
    throw new Error(detail);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export interface UserOut {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  // The address the user actually signed in with, for social accounts whose
  // `email` is a synthetic key.
  profile_email: string | null;
  created_at: string;
}

// Google's pass-through profile from the Decane callback. Display data for
// the account, never an identity claim.
export interface GoogleProfile {
  name?: string | null;
  email?: string | null;
  picture?: string | null;
}

export interface ChatOut {
  id: string;
  title: string | null;
  language: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ArtifactOut {
  id: string;
  kind: "image" | "file";
  filename: string | null;
  mime: string;
  size_bytes: number;
  url: string;
  chat_id: string;
  chat_title: string | null;
  message_id: string | null;
  created_at: string;
}

export interface AttachmentOut {
  id: string;
  kind: "image" | "file" | "audio";
  filename: string | null;
  mime: string;
  size_bytes: number;
  url?: string | null;
}

export interface MessageOut {
  id: string;
  chat_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  used_tools: boolean;
  created_at: string;
  attachments: AttachmentOut[];
}

export interface HealthOut {
  status: string;
}

// A file as the image picker hands it over. React Native's FormData accepts
// this shape directly and streams the file from disk.
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
}

export const backend = {
  // Social sign-in: exchange a Decane access token for our own session. The
  // Google profile (display-only) rides along so the account gets a name.
  decaneLogin: (accessToken: string, profile: GoogleProfile = {}) =>
    request<TokenBundle>("/auth/decane", {
      method: "POST",
      json: { access_token: accessToken, ...profile },
    }),
  me: () => request<UserOut>("/auth/me"),
  updateMe: (name: string) => request<UserOut>("/auth/me", { method: "PATCH", json: { name } }),
  health: () => request<HealthOut>("/health"),
  chats: () => request<ChatOut[]>("/chats"),
  chat: (id: string) => request<ChatOut>(`/chats/${id}`),
  createChat: (language = "en") =>
    request<ChatOut>("/chats", { method: "POST", json: { language } }),
  deleteChat: (id: string) => request<null>(`/chats/${id}`, { method: "DELETE" }),
  updateChat: (id: string, patch: { title?: string; pinned?: boolean }) =>
    request<ChatOut>(`/chats/${id}`, { method: "PATCH", json: patch }),
  artifacts: () => request<ArtifactOut[]>("/artifacts"),
  messages: (chatId: string) => request<MessageOut[]>(`/chats/${chatId}/messages`),
  // Synthesizes on first call, then returns the cached audio attachment.
  speakMessage: (chatId: string, messageId: string) =>
    request<AttachmentOut & { url: string }>(`/chats/${chatId}/messages/${messageId}/speech`, {
      method: "POST",
    }),
  upload: (file: LocalFile, chatId?: string) => {
    const form = new FormData();
    // The RN FormData file shape is not in the DOM typings; cast at the seam.
    form.append("file", file as unknown as Blob);
    if (chatId) form.append("chat_id", chatId);
    return request<AttachmentOut & { url: string }>("/attachments", {
      method: "POST",
      body: form,
    });
  },
  connectors: () =>
    request<{ id: string; provider: string; name: string; mode: string }[]>("/connectors"),
  // A cheap authed call whose 401-refresh path guarantees a fresh access
  // token right before a websocket connect.
  ensureFreshToken: () => request<ChatOut[]>("/chats?limit=1"),
};
