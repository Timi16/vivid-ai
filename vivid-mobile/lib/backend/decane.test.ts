import { existsSync } from "node:fs";
import { join } from "node:path";

import { DECANE_REDIRECT_URI } from "@/config/env";

import { parseGoogleReturn } from "./decane";

// The OS really does hand `vivid://auth` to the app, so the router has to have
// somewhere to put it. When it did not, the callback resolved against nothing
// and rendered +not-found -- a "Nothing here" page in the middle of signing in,
// holding the only copy of the token on a cold start. The scheme lives in
// app.json and the route lives in app/, so nothing but a test ties the two
// together.
describe("the Decane callback URL", () => {
  it("points at the app scheme", () => {
    const scheme = require("../../app.json").expo.scheme;
    expect(DECANE_REDIRECT_URI.startsWith(`${scheme}://`)).toBe(true);
  });

  it("has a route to land on", () => {
    const path = DECANE_REDIRECT_URI.split("://")[1].split("?")[0];
    const app = join(__dirname, "..", "..", "app");
    const candidates = [`${path}.tsx`, join(path, "index.tsx")];
    expect(candidates.some((c) => existsSync(join(app, c)))).toBe(true);
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
