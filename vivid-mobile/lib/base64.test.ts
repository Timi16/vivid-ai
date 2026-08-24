import { decodeBase64, encodeBase64 } from "./base64";

describe("base64", () => {
  it("round-trips bytes of every length modulo three", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 6, 31, 32, 33]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it("matches the reference encoding", () => {
    const bytes = new TextEncoder().encode("Vivid");
    expect(encodeBase64(bytes)).toBe("Vml2aWQ=");
    expect(new TextDecoder().decode(decodeBase64("Vml2aWQ="))).toBe("Vivid");
  });

  it("ignores whitespace in the input", () => {
    expect(new TextDecoder().decode(decodeBase64("Vml2\naWQ="))).toBe("Vivid");
  });
});
