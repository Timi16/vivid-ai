import type { Metadata } from "next";

import { GeneratedFilesView } from "@/features/artifacts";

export const metadata: Metadata = { title: "Images" };

export default function ImagesPage() {
  return (
    <GeneratedFilesView
      kind="image"
      title="Images"
      description="Every picture Vivid has generated for you, across every chat."
    />
  );
}
