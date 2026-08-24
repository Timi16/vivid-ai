import * as Clipboard from "expo-clipboard";

// Copy text and report whether it worked, so the caller can show the right
// toast instead of assuming success.
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
