// Base64 <-> bytes without relying on a global atob/btoa. Hermes ships both,
// but a pure implementation keeps the audio path independent of the runtime
// and is trivially unit testable.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const LOOKUP = new Uint8Array(256);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function decodeBase64(input: string): Uint8Array {
  // Strip padding and whitespace first; the byte count then follows from the
  // number of data characters alone (four characters carry three bytes).
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  const length = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(length);
  let cursor = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = LOOKUP[clean.charCodeAt(i + 2)];
    const d = LOOKUP[clean.charCodeAt(i + 3)];
    if (cursor < length) out[cursor++] = (a << 2) | (b >> 4);
    if (cursor < length) out[cursor++] = ((b & 15) << 4) | (c >> 2);
    if (cursor < length) out[cursor++] = ((c & 3) << 6) | d;
  }
  return out;
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? ALPHABET[c & 63] : "=";
  }
  return out;
}
