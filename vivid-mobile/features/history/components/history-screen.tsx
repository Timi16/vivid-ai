import { View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { HistoryView } from "@/features/history/components/history-view";
import { useChats } from "@/features/history/hooks/use-chats";

// Loads the user's chats and hands them to the view. The loading and error
// states carry the same header so the page does not jump when data lands.
export function HistoryScreen() {
  const { data, isPending, isError, error, refetch } = useChats();

  if (isPending) {
    return (
      <View style={{ gap: 24 }}>
        <PageHeader title="History" description="Everything you have asked, in one place." />
        <AsyncLoading rows={5} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ gap: 24 }}>
        <PageHeader title="History" description="Everything you have asked, in one place." />
        <AsyncError error={error} subject="your history" onRetry={() => refetch()} />
      </View>
    );
  }

  return <HistoryView entries={data} />;
}
