import { ChatLauncher } from "@/features/chat";
import { BackendStatus } from "@/features/system";

// The route composes the two slices. Neither imports the other: chat takes the
// status indicator as a slot.
export default function HomePage() {
  return <ChatLauncher statusSlot={<BackendStatus />} />;
}
