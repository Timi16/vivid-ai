import { parseGoogleReturn } from "./decane";

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
