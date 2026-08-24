import { Link } from "expo-router";

import { Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { AppText } from "@/components/ui/text";

export default function NotFoundScreen() {
  return (
    <Screen center contentStyle={{ alignItems: "center", gap: 12 }}>
      <AppText display size={24}>
        Nothing here
      </AppText>
      <AppText size={13.5} weight="regular" tone={0.55} align="center">
        That page does not exist. Head back to start a new thread.
      </AppText>
      <Link href="/" asChild>
        <Button label="Go home" />
      </Link>
    </Screen>
  );
}
