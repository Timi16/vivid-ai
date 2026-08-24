import { ThreadView } from "@/features/chat";
import { SPACES } from "@/features/spaces";

// The route composes the two slices: chat renders the thread, and the spaces it
// can be filed into are passed in, so neither slice imports the other.
export default async function ThreadPage({ params }: PageProps<"/thread/[id]">) {
  const { id } = await params;
  return (
    <ThreadView
      sessionId={id}
      spaces={SPACES.map((s) => ({ id: s.id, name: s.name, count: s.threadCount }))}
    />
  );
}
