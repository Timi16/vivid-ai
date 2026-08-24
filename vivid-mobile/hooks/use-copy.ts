import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";

import { copyText } from "@/lib/clipboard";

const COPIED_MS = 1500;

// Copy with feedback where the tap happened: the control that was pressed
// reports "Copied" for a moment and the phone gives a short haptic tick. No
// toast, because a message elsewhere on the screen is easy to miss and reads
// as noise next to the thing you just tapped.
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = useCallback(async (text: string): Promise<boolean> => {
    const ok = await copyText(text);
    if (!ok) return false;
    // Haptics are unavailable on some devices and in the simulator; the copy
    // still happened, so a missing tick is not an error.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    return true;
  }, []);

  return { copied, copy };
}
