import type { Metadata } from "next";

import { UpgradeView } from "@/features/billing";

export const metadata: Metadata = { title: "Upgrade" };

export default function UpgradePage() {
  return <UpgradeView currentPlanId="free" />;
}
