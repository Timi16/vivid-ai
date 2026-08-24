"use client";

import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { HistoryView } from "@/features/history";
import { useChats } from "@/features/history/hooks/use-chats";

export default function HistoryPage() {
  const { data, isPending, isError, error, refetch } = useChats();

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-[880px] px-5 py-10">
        <AsyncLoading label="Loading your history" rows={5} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-[880px] px-5 py-10">
        <AsyncError
          error={error}
          subject="your history"
          unconfiguredDetail="History goes live once the chat service is switched on."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return <HistoryView entries={data} />;
}
