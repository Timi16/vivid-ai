import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button-classes";
import { SettingsView } from "@/features/settings";

export const metadata: Metadata = { title: "Settings" };

// The plan row's action links into billing. Passed as a slot from the route, so
// settings never imports the billing slice.
export default function SettingsPage() {
  return (
    <SettingsView
      name="Guest"
      email="guest@vivid.ai"
      plan="the Free plan"
      planActionSlot={
        <Link href="/upgrade" className={buttonClasses({ size: "sm" })}>
          Upgrade
        </Link>
      }
    />
  );
}
