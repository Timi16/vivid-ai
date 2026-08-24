import { Stack } from "expo-router";

// Sign-in, verify, onboarding. Full bleed: no drawer, no topbar, the same
// ambient light behind the glass.
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: "slide_from_right",
      }}
    />
  );
}
