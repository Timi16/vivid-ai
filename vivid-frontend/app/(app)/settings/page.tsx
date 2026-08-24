import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button-classes";
import { SettingsView } from "@/features/settings";
import { BackendStatus } from "@/features/system";

export const metadata: Metadata = { title: "Settings" };

// The plan row's action links into billing. Passed as a slot from the route, so
// settings never imports the billing slice. Name and email come from the
// signed-in account inside the view.
export default function SettingsPage() {
  return (
    <SettingsView
      plan="the Free plan"
      planActionSlot={
        <Link href="/upgrade" className={buttonClasses({ size: "sm" })}>
          Upgrade
        </Link>
      }
      systemSlot={<BackendStatus />}
    />
  );
}
