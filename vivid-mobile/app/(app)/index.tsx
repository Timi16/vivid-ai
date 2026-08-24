import { Screen } from "@/components/layout/screen";
import { ChatLauncher } from "@/features/chat";
import { useChats } from "@/features/history";

// The route composes the two slices: history knows whether this is the
// user's first visit, chat renders the welcome accordingly.
export default function HomeScreen() {
  const { data: chats } = useChats();
  return (
    <Screen center>
      <ChatLauncher isFirstRun={chats !== undefined && chats.length === 0} />
    </Screen>
  );
}
