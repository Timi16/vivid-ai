import { useRouter } from "expo-router";
import { View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { topicNav } from "@/components/layout/nav-items";
import { SparkIcon } from "@/components/ui/icons";
import { Glass } from "@/components/ui/glass";
import { Tabs } from "@/components/ui/tabs";
import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

interface DiscoverViewProps {
  // Read from the `?topic=` query by the route. Unknown values fall back to
  // the first topic so a stale link still renders something sensible.
  topic: string;
}

// Discover is one route with the topic in the query, rather than five routes
// that would each render the same shell.
//
// There is no feed service, so every topic shows the same honest empty state.
// Inventing a feed of headlines would put words in the product's mouth that no
// backend is going to produce.
export function DiscoverView({ topic }: DiscoverViewProps) {
  const { theme } = useTheme();
  const router = useRouter();

  const current = topicNav.find((item) => item.topic === topic) ?? topicNav[0];

  return (
    <View>
      <PageHeader title="Discover" description="What is worth reading in the areas you follow." />

      <View style={{ marginTop: 24 }}>
        <Tabs
          value={topic}
          // setParams swaps the query on the current screen without pushing a
          // history entry, the same as the web's router.replace.
          onChange={(value) => router.setParams({ topic: value })}
          items={topicNav.map((item) => ({ value: item.topic, label: item.label }))}
        />
      </View>

      <Glass
        tier="card"
        sheen
        style={{ marginTop: 24, alignItems: "center", paddingHorizontal: 20, paddingVertical: 80 }}
      >
        <View style={{ maxWidth: 340, alignItems: "center", gap: 12 }}>
          <Glass
            tier="control"
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <SparkIcon size={18} color={theme.fg(0.7)} />
          </Glass>
          <AppText size={14} weight="semibold" tone={0.85} align="center">
            {current.label} isn&apos;t live yet
          </AppText>
          <AppText size={12.5} weight="regular" tone={0.5} align="center" lineHeight={20}>
            Discover turns on once the feed service ships. Until then, ask Vivid directly and it
            will search for you.
          </AppText>
        </View>
      </Glass>
    </View>
  );
}
