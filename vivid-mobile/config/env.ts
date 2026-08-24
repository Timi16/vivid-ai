// Public runtime configuration. Everything here ships in the app binary, so
// nothing secret belongs in this file: the backend holds the secrets.

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export const DECANE_APP_ID = process.env.EXPO_PUBLIC_DECANE_APP_ID ?? "";
export const DECANE_API_KEY = process.env.EXPO_PUBLIC_DECANE_API_KEY ?? "";

// The deep link Decane redirects back to after Google consent. Must match the
// `scheme` in app.json and the callback URL registered in the Decane dashboard.
export const DECANE_REDIRECT_URI = "vivid://auth";

export const APP_NAME = "Vivid";
