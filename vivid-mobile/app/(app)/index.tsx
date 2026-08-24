import { Screen } from "@/components/layout/screen";
import { ChatLauncher } from "@/features/chat";
import { BackendStatus } from "@/features/system";

// The route composes the two slices. Neither imports the other: chat takes
// the status indicator as a slot.
export default function HomeScreen() {
  return (
    <Screen center>
      <ChatLauncher statusSlot={<BackendStatus />} />
    </Screen>
  );
}
