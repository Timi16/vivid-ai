import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { RADIUS, type GlassTier } from "@/lib/theme";

export interface GlassProps extends ViewProps {
  tier?: GlassTier;
  radius?: number;
  // The specular streak across the top. Pair with any tier.
  sheen?: boolean;
  // Force the blur layer on or off. Tiers carry a default; lists of cards
  // turn it off because a blur per row is expensive on Android.
  blur?: boolean;
  // Ask for a solid ground under the material. See `grounded` below: panels
  // that float in their own window need this on every platform, because a
  // React Native Modal is a separate window and the blur inside it has only
  // the scrim to sample.
  opaque?: boolean;
  // Selected / pressed state: brighter border and a touch more light.
  active?: boolean;
  invalid?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

// Every button, card, menu and sheet is this one material at a different
// weight. Three things make it read as glass rather than a grey box: the
// backdrop blur, a bright inset line along the top edge, and a soft shadow
// underneath. All three live here so no screen rebuilds them by hand.
export function Glass({
  tier = "card",
  radius,
  sheen = false,
  blur,
  opaque = false,
  active = false,
  invalid = false,
  style,
  children,
  ...props
}: GlassProps) {
  const { theme } = useTheme();
  const glass = theme.glass[tier];
  const resolvedRadius =
    radius ?? (tier === "control" || tier === "bright" ? RADIUS.control : RADIUS.card);
  const showBlur = blur ?? glass.blur > 0;
  const dark = theme.mode === "dark";

  // The blurred tiers carry almost no colour of their own -- 6.5% white at
  // base, 7.5% at sheet -- because the backdrop blur is what was supposed to
  // make them solid. Wherever that blur does not actually render, the surface
  // turns into a sheet of glass with nothing behind it and whatever is under
  // it reads straight through: the drawer showing the chat screen through
  // itself, a menu showing the drawer through itself.
  //
  // Two places it does not render. A React Native Modal is its own window, so
  // a blur inside one can only sample the scrim -- that is the `opaque` flag,
  // and it holds on every platform. And on Android the underlying
  // dimezisBlurView is unreliable, notably under the New Architecture, which
  // this app enables.
  //
  // So those surfaces get the sheet colour painted under them. This is safe
  // where the blur does work: a working blur draws over this ground and hides
  // it completely, so nothing changes on the platforms that were already fine.
  const grounded = showBlur && (opaque || Platform.OS === "android");

  const borderColor = invalid
    ? "rgba(246,165,165,0.55)"
    : active
      ? dark
        ? "rgba(255,255,255,0.45)"
        : "rgba(0,0,0,0.3)"
      : glass.borderColor;

  const activeWash = active
    ? { backgroundColor: dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.06)" }
    : null;

  return (
    <View
      {...props}
      style={[
        {
          borderRadius: resolvedRadius,
          borderWidth: 1,
          borderColor,
          backgroundColor: grounded ? theme.colors.sheet : glass.backgroundColor,
          shadowColor: "#000",
          shadowOpacity: glass.shadowOpacity,
          shadowRadius: glass.shadowRadius,
          shadowOffset: { width: 0, height: glass.shadowOffsetY },
          elevation: tier === "sheet" ? 12 : tier === "card" ? 6 : 2,
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: resolvedRadius, overflow: "hidden" }]}
      >
        {/* Under the blur on purpose: a blur that renders covers this, and
            one that does not leaves it carrying the tint the tier is meant
            to have over the solid ground. */}
        {grounded ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.backgroundColor }]} />
        ) : null}
        {showBlur ? (
          <BlurView
            intensity={glass.blur}
            tint={dark ? "dark" : "light"}
            experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {activeWash ? <View style={[StyleSheet.absoluteFill, activeWash]} /> : null}
        {sheen ? (
          <LinearGradient
            colors={
              dark
                ? ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.02)", "rgba(255,255,255,0)"]
                : ["rgba(255,255,255,0.5)", "rgba(255,255,255,0.08)", "rgba(255,255,255,0)"]
            }
            locations={[0, 0.42, 0.6]}
            style={StyleSheet.absoluteFill}
          />
        ) : tier !== "well" ? (
          <LinearGradient
            colors={
              dark
                ? ["rgba(255,255,255,0.085)", "rgba(255,255,255,0)"]
                : ["rgba(255,255,255,0.9)", "rgba(255,255,255,0.35)"]
            }
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {/* The lit rim: a one-pixel line along the top edge. */}
        <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: glass.highlight }} />
      </View>
      {children}
    </View>
  );
}
