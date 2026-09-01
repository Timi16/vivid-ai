import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";

import { Screen } from "@/components/layout/screen";
import { AppText } from "@/components/ui/text";
import { backend, setTokens, useAuthTokens } from "@/lib/backend/client";

// `vivid://auth` -- the callback registered for the Decane API key, and so a
// URL the OS really does hand to the app. Without a route here the router
// resolved the path `/auth` against nothing and rendered +not-found, which is
// the "Nothing here" screen people hit mid-sign-in.
//
// In the happy path `WebBrowser.openAuthSessionAsync` intercepts the redirect
// and the sign-in form finishes the exchange, so this screen only flashes past
// on its way home. It earns its keep in the other case: when the browser is a
// separate task Android may deliver the callback as a fresh intent (cold
// starting the app), and then there is no pending auth session to resolve.
// The deep link is the only thing carrying the token, so this completes the
// exchange itself rather than stranding a signed-out user on a dead page.
export default function AuthCallback() {
  const params = useLocalSearchParams<{
    decane_jwt?: string;
    decane_name?: string;
    decane_email?: string;
    decane_picture?: string;
    decane_error?: string;
  }>();
  const signedIn = useAuthTokens() !== null;
  const [done, setDone] = useState(false);
  // The exchange must run once. Params keep their identity across the renders
  // that setTokens triggers, so without this a resolved token re-enters.
  const started = useRef(false);

  const jwt = params.decane_jwt;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!jwt || signedIn) {
      setDone(true);
      return;
    }
    backend
      .decaneLogin(jwt, {
        name: params.decane_name ?? null,
        email: params.decane_email ?? null,
        picture: params.decane_picture ?? null,
      })
      .then(setTokens)
      // A failure here lands on the sign-in screen, which is the one place
      // that can explain itself and offer another go.
      .catch(() => undefined)
      .finally(() => setDone(true));
  }, [jwt, signedIn, params.decane_name, params.decane_email, params.decane_picture]);

  // The guard in the root layout decides which shell to hand back to, so both
  // outcomes route to "/" and let it sort them.
  if (done) return <Redirect href="/" />;

  return (
    <Screen center contentStyle={{ alignItems: "center", gap: 14 }}>
      <ActivityIndicator />
      <AppText size={13.5} weight="regular" tone={0.55}>
        Finishing sign-in…
      </AppText>
    </Screen>
  );
}
