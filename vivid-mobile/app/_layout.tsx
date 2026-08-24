import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  useFonts,
} from "@expo-google-fonts/geist";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AmbientBackdrop } from "@/components/layout/ambient-backdrop";
import { NetworkBanner } from "@/components/network-banner";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider, readThemePreference, useTheme } from "@/hooks/use-theme";
import { loadTokens, useAuthTokens } from "@/lib/backend/client";
import { createQueryClient } from "@/lib/query-client";
import type { ThemePreference } from "@/lib/theme";

// Hold the splash until fonts, the stored theme and the stored session are
// all known, so the first frame is already the right screen in the right
// theme. That is the mobile equivalent of the web's inline theme script.
void SplashScreen.preventAutoHideAsync();

const queryClient = createQueryClient();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
  });
  const [boot, setBoot] = useState<{ theme: ThemePreference } | null>(null);

  useEffect(() => {
    Promise.all([loadTokens(), readThemePreference()]).then(([, theme]) => setBoot({ theme }));
  }, []);

  const ready = fontsLoaded && boot !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider initialPreference={boot.theme}>
          <QueryClientProvider client={queryClient}>
            <RootNavigator />
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { theme } = useTheme();
  const tokens = useAuthTokens();
  const signedIn = tokens !== null;
  // The navigator paints its own container background (light grey by
  // default) over everything behind it. Make it transparent so the ambient
  // backdrop shows through every screen, exactly like the web shell.
  const navigationTheme = useMemo(() => {
    const base = theme.mode === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, background: "transparent", card: "transparent" },
    };
  }, [theme.mode]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <AmbientBackdrop />
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
          animation: "fade",
        }}
      >
        {/* The guard is the auth gate: no token, no app. Signing out flips
            it and the router swaps the shell for the auth screens. */}
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <NetworkBanner />
      <Toaster />
    </NavigationThemeProvider>
  );
}
