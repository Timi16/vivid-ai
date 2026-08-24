import type { Metadata } from "next";

import { OnboardingFlow } from "@/features/auth";

export const metadata: Metadata = { title: "Get started" };

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
