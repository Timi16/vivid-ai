import { useLocalSearchParams } from "expo-router";

import { Screen } from "@/components/layout/screen";
import { VerifyForm } from "@/features/auth";

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  return (
    <Screen center>
      <VerifyForm email={email} />
    </Screen>
  );
}
