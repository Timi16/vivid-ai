import type { Metadata } from "next";

import { GeneratedFilesView } from "@/features/artifacts";

export const metadata: Metadata = { title: "Artifacts" };

export default function ArtifactsPage() {
  return <GeneratedFilesView />;
}
