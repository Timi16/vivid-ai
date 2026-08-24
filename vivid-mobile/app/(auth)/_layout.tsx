import { Stack } from "expo-router";

// Signed-out entry is always the sign-in screen. Without this the group has
// no index, and the router would open whichever screen sorts first.
export const unstable_settings = { initialRouteName: "sign-in" };

// Sign-in, verify, onboarding. Full bleed: no drawer, no topbar, the same
// ambient light behind the glass.
export default function AuthLayout() {
  return (
    <Stack
      initialRouteName="sign-in"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: "slide_from_right",
      }}
    />
  );
}
