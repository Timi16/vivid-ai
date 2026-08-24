import type { Metadata } from "next";

import { ARTIFACTS, ArtifactsView } from "@/features/artifacts";

export const metadata: Metadata = { title: "Artifacts" };

export default function ArtifactsPage() {
  return <ArtifactsView artifacts={ARTIFACTS} />;
}
