import { Link } from "expo-router";

import { Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { SettingsView } from "@/features/settings";
import { useAuthTokens } from "@/lib/backend/client";

// The route composes settings with billing's entry point: the upgrade button
// is a slot, so settings never imports the billing slice.
export default function SettingsRoute() {
  const tokens = useAuthTokens();
  const email = tokens?.user?.email ?? "";
  return (
    <Screen>
      <SettingsView
        name={email ? email.split("@")[0] : "Guest"}
        email={email}
        plan="Free plan"
        planActionSlot={
          <Link href="/upgrade" asChild>
            <Button variant="secondary" size="sm" label="Upgrade" />
          </Link>
        }
      />
    </Screen>
  );
}
