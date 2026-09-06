"use client";

// The live backend client, ported from the proven integration in the previous
// frontend. DELIBERATE DEVIATION from the proxy-everything rule in
// lib/server/upstream.ts: chat needs a browser websocket straight to the
// backend (route handlers cannot proxy websockets), so REST goes direct too —
// one transport, one auth story. CORS on the backend allows this origin.
// The /api/health route handler keeps the server-side proxy pattern alive for
// anything that later needs a secret.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";

const TOKEN_KEY = "vivid_tokens";

export interface UserOut {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  profile_email: string | null;
  created_at: string;
}

export interface TokenBundle {
  access_token: string;
  refresh_token: string;
  user?: UserOut;
}

export interface GoogleProfile {
  name?: string | null;
  email?: string | null;
  picture?: string | null;
}

export function getTokens(): TokenBundle | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function setTokens(tokens: TokenBundle | null) {
  if (typeof window === "undefined") return;
  if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKEN_KEY);
}

async function refreshTokens(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens?.refresh_token) return false;
  const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  });
  if (!res.ok) return false;
  setTokens((await res.json()) as TokenBundle);
  return true;
}

interface RequestInitPlus extends RequestInit {
  json?: unknown;
}

// One voice for every network failure: actionable, not "Failed to fetch".
export const NETWORK_ERROR_MESSAGE =
  "Network problem — check your internet connection and try again.";

async function request<T>(path: string, init: RequestInitPlus = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  const tokens = getTokens();
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
    setTokens(null);
    if (typeof window !== "undefined") window.location.href = "/sign-in";
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const parsed = (await res.json()) as { detail?: string };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      // keep the status message
    }
    throw new Error(detail);
  }
  return (res.status === 204 ? null : await res.json()) as T;
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
  kind: "image" | "video" | "file";
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
  kind: "image" | "video" | "file" | "audio";
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
  upload: (file: File, chatId?: string) => {
    const form = new FormData();
    form.append("file", file);
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
