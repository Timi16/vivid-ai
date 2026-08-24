import { useEffect, useState } from "react";
import { View } from "react-native";

import { Spinner } from "@/components/ui/spinner";
import { AppText } from "@/components/ui/text";

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
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
    >
      <Spinner tone={0.6} />
      <AppText size={13.5} tone={0.45}>
        {PHRASES[index]}…
      </AppText>
    </View>
  );
}
