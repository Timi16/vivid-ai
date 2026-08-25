// "Continue with Google" through Decane Connect: identity only.
//
// The Decane SDKs are embedded-WALLET kits: after Google confirms who the
// user is, they go on to create a crypto wallet and demand a passkey or PIN
// to encrypt the wallet's key share. Vivid only needs the identity, and
// Decane hands that over BEFORE any wallet step: the callback URL carries
// `decane_jwt`, the very access token our backend verifies. So this talks to
// Decane's one relevant endpoint directly and never loads an SDK: no
// passkey, no wallet, no PIN. Same flow as the web app.
//
// Flow: GET /auth/google/init -> the in-app browser sheet shows Google ->
// Decane redirects to the API key's registered callback (`vivid://auth`) with
// ?decane_jwt=... -> we exchange that for a Vivid session.

import * as WebBrowser from "expo-web-browser";

import { DECANE_API_BASE, DECANE_API_KEY, DECANE_APP_ID, DECANE_REDIRECT_URI } from "@/config/env";
import { NETWORK_ERROR_MESSAGE, type GoogleProfile } from "@/lib/backend/client";

export const decaneConfigured = Boolean(DECANE_APP_ID && DECANE_API_KEY);

async function decanePost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${DECANE_API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": DECANE_API_KEY,
        "X-App-Id": DECANE_APP_ID,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) {
    let detail = `That did not work (${res.status})`;
    try {
      const parsed = (await res.json()) as { error?: { message?: string } };
      if (parsed.error?.message) detail = parsed.error.message;
    } catch {
      // keep the status message
    }
    throw new Error(detail);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

// Step one of the emailed-code sign-in: Decane sends a six-digit code.
export async function startEmailSignIn(email: string): Promise<void> {
  await decanePost("/auth/email/start", { email });
}

interface EmailVerifyResponse {
  jwt: string;
  isNewUser?: boolean;
  profile?: { name?: string | null; email?: string | null; picture?: string | null };
}

// Step two: the code buys the same Decane access token the Google callback
// returns, which our backend verifies to open a Vivid session.
export async function verifyEmailCode(
  email: string,
  code: string
): Promise<{ jwt: string; profile: GoogleProfile }> {
  const result = await decanePost<EmailVerifyResponse>("/auth/email/verify", { email, code });
  if (!result?.jwt) throw new Error("That code did not work. Ask for a new one.");
  return {
    jwt: result.jwt,
    profile: {
      name: result.profile?.name ?? null,
      // Decane does not echo the address back, and it is the one thing we
      // know for certain here: the code only reaches the inbox that owns it.
      email: result.profile?.email ?? email,
      picture: result.profile?.picture ?? null,
    },
  };
}

export type GoogleReturn = { jwt: string; profile: GoogleProfile } | { error: string } | null;

async function fetchConsentUrl(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${DECANE_API_BASE}/auth/google/init`, {
      headers: { "X-API-Key": DECANE_API_KEY, "X-App-Id": DECANE_APP_ID },
    });
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) {
    let detail = `Google sign-in could not start (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) detail = body.error.message;
    } catch {
      // keep the status message
    }
    throw new Error(detail);
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

// Reads Decane's return params off the callback URL. Exported so it can be
// unit tested without a browser.
export function parseGoogleReturn(callbackUrl: string): GoogleReturn {
  const query = callbackUrl.split("?")[1]?.split("#")[0] ?? "";
  const params = new URLSearchParams(query);
  const jwt = params.get("decane_jwt");
  const error = params.get("decane_error");
  if (!jwt && !error) return null;
  if (error) return { error };
  return {
    jwt: jwt as string,
    profile: {
      name: params.get("decane_name"),
      email: params.get("decane_email"),
      picture: params.get("decane_picture"),
    },
  };
}

// Runs the whole consent round trip in the system auth sheet and resolves
// with what Decane sent back, or null when the user dismissed the sheet.
export async function signInWithGoogle(): Promise<GoogleReturn> {
  const url = await fetchConsentUrl();
  const result = await WebBrowser.openAuthSessionAsync(url, DECANE_REDIRECT_URI);
  if (result.type !== "success") return null;
  return parseGoogleReturn(result.url);
}
