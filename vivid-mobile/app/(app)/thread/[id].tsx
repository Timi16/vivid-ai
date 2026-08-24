import { useLocalSearchParams } from "expo-router";

import { ThreadView } from "@/features/chat";
import { SPACES } from "@/features/spaces";

// The route composes the two slices: chat renders the thread, and the spaces
// it can be filed into are passed in, so neither slice imports the other.
export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ThreadView
      key={id}
      sessionId={id}
      spaces={SPACES.map((space) => ({ id: space.id, name: space.name, count: space.threadCount }))}
    />
  );
}
