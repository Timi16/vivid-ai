// "Continue with Google" through Decane Connect's Expo SDK. Decane runs the
// Google flow through its own OAuth client (no Google Cloud registration on
// our side), hands back an ES256 access token, and the backend verifies that
// token offline in POST /v1/auth/decane. Same project, same backend route as
// the web app; only the SDK package differs.
//
// The SDK is lazy-loaded: it pulls in wallet libraries that have no business
// in the startup path of a chat app.

import { DECANE_API_KEY, DECANE_APP_ID, DECANE_REDIRECT_URI } from "@/config/env";

export function isGoogleSignInConfigured(): boolean {
  return Boolean(DECANE_APP_ID && DECANE_API_KEY);
}

type DecaneClient = Awaited<ReturnType<typeof import("decane-connect-kit-expo")["createDecaneConnect"]>>;

let clientPromise: Promise<DecaneClient> | null = null;

// A PIN is only ever asked for on a device with no hardware keystore (a
// simulator, mostly). The sign-in screen mounts the prompt; this is the seam.
let pinPrompt: (() => Promise<string>) | null = null;

export function setPinPrompt(prompt: (() => Promise<string>) | null) {
  pinPrompt = prompt;
}

async function getClient(): Promise<DecaneClient> {
  if (!clientPromise) {
    clientPromise = import("decane-connect-kit-expo").then(({ createDecaneConnect }) =>
      createDecaneConnect({
        appId: DECANE_APP_ID,
        apiKey: DECANE_API_KEY,
        chains: ["evm:8453"],
        authMethods: ["google"],
        redirectUri: DECANE_REDIRECT_URI,
        // Sign-in is all this app needs from Decane. The wallet's device share
        // still has to be protected at rest, so let the keystore do it, with
        // a PIN as the universal fallback. No passkey tier: that needs an
        // associated domain we do not have.
        unlockPreference: ["secure-enclave", "pin"],
        promptPin: () => {
          if (!pinPrompt) return Promise.reject(new Error("Sign-in needs a PIN prompt on this device."));
          return pinPrompt();
        },
        // The recovery file is a wallet concern, not a sign-in one.
        offerRecoveryAtSignup: false,
      })
    );
    // A failed construction must not poison every later attempt.
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

// Runs the Google consent flow in the in-app browser sheet and returns the
// Decane access token the backend exchanges for our own session.
export async function signInWithGoogle(): Promise<string> {
  const decane = await getClient();
  await decane.connectWithGoogle();
  const accessToken = decane.getAccessToken();
  if (!accessToken) throw new Error("Google sign-in did not complete");
  return accessToken;
}
