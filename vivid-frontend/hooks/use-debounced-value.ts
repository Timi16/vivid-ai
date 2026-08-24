"use client";

import { useEffect, useState } from "react";

// Delay updates to a value. Used by search inputs and filters so a keystroke
// does not become a request.
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
