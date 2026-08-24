import type { Metadata } from "next";

import { CustomizeView } from "@/features/customize";

export const metadata: Metadata = { title: "Customize" };

export default function CustomizePage() {
  return <CustomizeView />;
}
