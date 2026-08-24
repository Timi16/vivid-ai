"use client";

// "Continue with Google" through Decane Connect — identity only.
//
// The Decane SDK (decane-connect-kit) is an embedded-WALLET kit: after Google
// confirms who the user is, it goes on to create a crypto wallet and demands
// a passkey/PIN to encrypt the wallet's key share. Vivid only needs the
// identity, and Decane hands that over BEFORE any wallet step: the callback
// URL carries `decane_jwt`, the very access token our backend verifies. So
// this talks to Decane's two relevant endpoints directly and never loads the
// SDK — no passkey, no wallet, no PIN.
//
// Flow: GET /auth/google/init → full-page redirect to Google → Decane sends
// the browser back to the dashboard's callback URL (our /sign-in) with
// ?decane_jwt=… → we exchange that for a Vivid session.

import { NETWORK_ERROR_MESSAGE } from "@/lib/backend/client";

const DECANE_API_BASE = "https://backend.decane.app";
const DECANE_APP_ID = process.env.NEXT_PUBLIC_DECANE_APP_ID ?? "";
const DECANE_API_KEY = process.env.NEXT_PUBLIC_DECANE_API_KEY ?? "";

export const decaneConfigured = Boolean(DECANE_APP_ID && DECANE_API_KEY);

export async function startGoogleSignIn(): Promise<never> {
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
  window.location.href = url;
  // The page is navigating away; nothing after this ever runs.
  return new Promise<never>(() => {});
}

/**
 * Reads Decane's return params off the current URL (and scrubs them from the
 * address bar). Returns null when this page load is not a Google return.
 */
export function readGoogleReturn():
  | { jwt: string; profile: { name: string | null; email: string | null; picture: string | null } }
  | { error: string }
  | null {
  const params = new URLSearchParams(window.location.search);
  const jwt = params.get("decane_jwt");
  const error = params.get("decane_error");
  if (!jwt && !error) return null;
  window.history.replaceState({}, "", window.location.pathname);
  if (error) return { error };
  // Google's profile is passed through by Decane alongside the token —
  // display data for the account, never an identity claim.
  return {
    jwt: jwt as string,
    profile: {
      name: params.get("decane_name"),
      email: params.get("decane_email"),
      picture: params.get("decane_picture"),
    },
  };
}
