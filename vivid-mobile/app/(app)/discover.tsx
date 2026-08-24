import { useLocalSearchParams } from "expo-router";

import { Screen } from "@/components/layout/screen";
import { DiscoverView } from "@/features/discover";

export default function DiscoverRoute() {
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  return (
    <Screen>
      <DiscoverView topic={topic ?? "discover"} />
    </Screen>
  );
}
