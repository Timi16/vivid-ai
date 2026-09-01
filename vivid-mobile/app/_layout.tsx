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
  useRouter,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const router = useRouter();

  // When the session flips, replace the whole history rather than push: the
  // auth screens must never sit under the app (or the app under them) where
  // a back action could reveal them. Covers every path that clears or sets
  // tokens, including a 401 inside the API client.
  // The native window behind every screen carries the page colour, so no
  // transition or blur can ever show the system default white through.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.page);
  }, [theme.colors.page]);

  const wasSignedIn = useRef(signedIn);
  useEffect(() => {
    if (wasSignedIn.current === signedIn) return;
    wasSignedIn.current = signedIn;
    router.replace(signedIn ? "/" : "/sign-in");
  }, [signedIn, router]);
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
          // No transition on the root switch. A cross-fade lets the outgoing
          // sign-in card's blur sample the bare window for a frame and flash
          // white; an instant swap has nothing to sample.
          animation: "none",
          // The root has no legitimate "back": swiping must never reveal the
          // auth screens under the app, or the app under the auth screens.
          gestureEnabled: false,
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
        {/* Outside the gate on purpose: `vivid://auth` is Decane's registered
            callback, so it arrives while still signed out, and on a cold start
            it is the only thing carrying the token. Guarding it would send the
            token to whichever shell the guard picked instead of to the screen
            that knows how to spend it.
            Last on purpose too: a navigator opens on its first screen, so
            declaring this above the gate made every cold start begin on the
            callback screen with no callback to handle. */}
        <Stack.Screen name="auth" />
      </Stack>
      <NetworkBanner />
      <Toaster />
    </NavigationThemeProvider>
  );
}
