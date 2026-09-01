import { DECANE_REDIRECT_URI } from "@/config/env";

import { parseGoogleReturn } from "./decane";

// Node's built-ins are deliberately outside this project's `types`, so that
// app code cannot reach for them. Reading the route tree off disk is the one
// thing here that is not app code, so it borrows just the call it needs
// rather than opening the door for everything.
const { existsSync } = jest.requireActual("node:fs") as {
  existsSync(path: string): boolean;
};
const appJson = jest.requireActual("../../app.json") as { expo: { scheme: string } };

// The OS really does hand `vivid://auth` to the app, so the router has to have
// somewhere to put it. When it did not, the callback resolved against nothing
// and rendered +not-found -- a "Nothing here" page in the middle of signing in,
// holding the only copy of the token on a cold start. The scheme lives in
// app.json and the route lives in app/, so nothing but a test ties the two
// together.
describe("the Decane callback URL", () => {
  it("points at the app scheme", () => {
    expect(DECANE_REDIRECT_URI.startsWith(`${appJson.expo.scheme}://`)).toBe(true);
  });

  // Jest runs from the project root, so these are the paths expo-router would
  // resolve the callback's own path against.
  it("has a route to land on", () => {
    const path = DECANE_REDIRECT_URI.split("://")[1].split("?")[0];
    expect([`app/${path}.tsx`, `app/${path}/index.tsx`].some(existsSync)).toBe(true);
  });
});

describe("parseGoogleReturn", () => {
  it("returns null when the URL carries no Decane params", () => {
    expect(parseGoogleReturn("vivid://auth")).toBeNull();
    expect(parseGoogleReturn("vivid://auth?foo=bar")).toBeNull();
  });

  it("reads the token and the pass-through profile", () => {
    const url =
      "vivid://auth?decane_jwt=abc.def.ghi&decane_name=Ada%20Lovelace&decane_email=ada%40example.com&decane_picture=https%3A%2F%2Fx%2Fp.png";
    expect(parseGoogleReturn(url)).toEqual({
      jwt: "abc.def.ghi",
      profile: { name: "Ada Lovelace", email: "ada@example.com", picture: "https://x/p.png" },
    });
  });

  it("surfaces an error param", () => {
    expect(parseGoogleReturn("vivid://auth?decane_error=access_denied")).toEqual({
      error: "access_denied",
    });
  });
});
