"use client";

import { useEffect, useState } from "react";

// What the reply is doing before the first token lands. Rotating through a
// few verbs reads as alive rather than stuck; real tool steps replace this
// line whenever the backend reports them.
const PHRASES = ["Thinking", "Honing", "Crystallizing", "Weaving", "Considering", "Composing"];

export function ThinkingLine() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % PHRASES.length), 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <p className="text-fg/45 flex items-center gap-2 text-[13.5px]" aria-live="polite">
      <span className="border-fg/20 border-t-fg/60 size-3 animate-spin rounded-full border-2" />
      <span key={index} className="animate-[fade-in_300ms_ease]">
        {PHRASES[index]}…
      </span>
    </p>
  );
}
