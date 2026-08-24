import { Suspense } from "react";
import type { Metadata } from "next";

import { DiscoverView } from "@/features/discover";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  // useSearchParams needs a Suspense boundary so the shell can still prerender.
  return (
    <Suspense fallback={null}>
      <DiscoverView />
    </Suspense>
  );
}
