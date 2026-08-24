import { Link } from "expo-router";

import { Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { SettingsView } from "@/features/settings";
import { BackendStatus } from "@/features/system";

// The plan row's action links into billing and the backend indicator comes
// from the system slice. Both are passed as slots from the route, so settings
// never imports either. Name and email come from the signed-in account inside
// the view.
export default function SettingsRoute() {
  return (
    <Screen>
      <SettingsView
        plan="the Free plan"
        planActionSlot={
          <Link href="/upgrade" asChild>
            <Button variant="secondary" size="sm" label="Upgrade" />
          </Link>
        }
        systemSlot={<BackendStatus />}
      />
    </Screen>
  );
}
