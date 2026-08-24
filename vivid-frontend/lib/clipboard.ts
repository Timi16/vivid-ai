// Copy text to the clipboard, reporting whether it worked so the caller can
// show the right toast rather than claiming success it did not get.
//
// The async Clipboard API needs a secure context and a user gesture. Both hold
// for a click handler on https or localhost, but not for an http preview on a
// LAN address, which is exactly where a silent failure would be confusing.
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
