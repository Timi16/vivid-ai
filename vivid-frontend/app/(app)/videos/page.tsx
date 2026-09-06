import type { Metadata } from "next";

import { GeneratedFilesView } from "@/features/artifacts";

export const metadata: Metadata = { title: "Videos" };

export default function VideosPage() {
  return (
    <GeneratedFilesView
      kind="video"
      title="Videos"
      description="Every clip Vivid has generated for you, across every chat."
    />
  );
}
