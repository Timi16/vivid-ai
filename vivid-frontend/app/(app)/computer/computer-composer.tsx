"use client";

import { useState } from "react";

import { ChatComposer } from "@/features/chat";

// Lives at the route layer, not in either slice. `app/` is the one place
// allowed to reach into features, which is what makes it the right home for
// the glue between two of them.
export function ComputerComposer() {
  const [prompt, setPrompt] = useState("");
  return (
    <ChatComposer
      value={prompt}
      onValueChange={setPrompt}
      onSubmit={setPrompt}
      model="Vivid Computer"
    />
  );
}
