// Public runtime configuration. Everything here ships in the app binary, so
// nothing secret belongs in this file: the backend holds the secrets.

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

// "Continue with Google" via Decane Connect. The key is browser-safe (it is
// origin/callback allowlisted in the Decane dashboard); the app id is public.
export const DECANE_API_BASE = "https://backend.decane.app";
export const DECANE_APP_ID = process.env.EXPO_PUBLIC_DECANE_APP_ID ?? "";
export const DECANE_API_KEY = process.env.EXPO_PUBLIC_DECANE_API_KEY ?? "";

// The deep link Decane redirects back to after Google consent. Must match the
// `scheme` in app.json and the callback URL registered for the API key.
export const DECANE_REDIRECT_URI = "vivid://auth";

// Pages that exist in the design but have no service behind them yet stay
// hidden until they are real. Set EXPO_PUBLIC_PREVIEW_FEATURES=1 to see them.
export const PREVIEW_FEATURES = process.env.EXPO_PUBLIC_PREVIEW_FEATURES === "1";

export const APP_NAME = "Vivid";
