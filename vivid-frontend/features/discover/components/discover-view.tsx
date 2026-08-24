"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsIndicator, TabsList, TabsTab } from "@/components/ui/tabs";
import { SparkIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { topicNav } from "@/components/layout/nav-items";

// Discover is one route with the topic in the query, rather than five routes
// that would each render the same shell.
//
// There is no feed service, so every topic shows the same honest empty state.
// Inventing a feed of headlines would put words in the product's mouth that no
// backend is going to produce.
export function DiscoverView() {
  const router = useRouter();
  const params = useSearchParams();
  const topic = params.get("topic") ?? "discover";

  const current = topicNav.find((item) => item.href.endsWith(topic)) ?? topicNav[0];

  return (
    <div className="mx-auto w-full max-w-[880px] px-5 py-8">
      <PageHeader title="Discover" description="What is worth reading in the areas you follow." />

      <Tabs
        value={topic}
        onValueChange={(value) => router.replace(`/discover?topic=${value}`)}
        className="mt-6"
      >
        <TabsList className="max-w-full overflow-x-auto">
          {topicNav.map((item) => {
            const value = item.href.split("=")[1] ?? "discover";
            return (
              <TabsTab key={item.href} value={value}>
                {item.label}
              </TabsTab>
            );
          })}
          <TabsIndicator />
        </TabsList>
      </Tabs>

      <div className="vd-glass-card vd-sheen mt-6 grid place-items-center px-5 py-20 text-center">
        <div className="flex max-w-[42ch] flex-col items-center gap-3">
          <span className="vd-glass-control text-fg/70 grid size-11 place-items-center rounded-full">
            <SparkIcon size={18} />
          </span>
          <p className="text-fg/85 text-[14px] font-semibold">
            {current.label} isn&apos;t live yet
          </p>
          <p className="text-fg/50 text-[12.5px] leading-relaxed font-normal">
            Discover turns on once the feed service ships. Until then, ask Vivid directly and it
            will search for you.
          </p>
        </div>
      </div>
    </div>
  );
}
