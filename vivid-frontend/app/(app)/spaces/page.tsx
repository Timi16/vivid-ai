import type { Metadata } from "next";

import { SPACES, SpacesView } from "@/features/spaces";

export const metadata: Metadata = { title: "Spaces" };

export default function SpacesPage() {
  return <SpacesView spaces={SPACES} />;
}
