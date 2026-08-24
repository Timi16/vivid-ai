import { useCallback, useState } from "react";

// Open/close state for menus and dialogs, so every caller spells it the same.
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  return { open, setOpen, show, hide };
}
