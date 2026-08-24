import { useEffect, useState } from "react";

// Trails the input by `delay` ms. Used for search boxes so a keystroke does
// not re-filter the whole list.
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
