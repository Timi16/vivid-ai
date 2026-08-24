import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Rect, RadialGradient, Stop } from "react-native-svg";

import { useTheme } from "@/hooks/use-theme";

interface Pool {
  cx: string;
  cy: string;
  rx: string;
  ry: string;
  color: string;
  // Opacity at the centre and at the 44% ring. Kept separate from the colour
  // because react-native-svg ignores the alpha channel of an rgba() stop on
  // iOS: an rgba(255,255,255,0.24) pool painted as solid white.
  from: number;
  mid: number;
}

// Ported from the vd-ambient utility in the web's globals.css: bright pools
// on black, soft shadow pools on the light page.
const DARK_POOLS: Pool[] = [
  { cx: "50%", cy: "16%", rx: "72%", ry: "58%", color: "#ffffff", from: 0.24, mid: 0.07 },
  { cx: "0%", cy: "36%", rx: "44%", ry: "52%", color: "#cad6f0", from: 0.2, mid: 0.05 },
  { cx: "100%", cy: "86%", rx: "48%", ry: "50%", color: "#f2ebe0", from: 0.16, mid: 0.04 },
  { cx: "50%", cy: "100%", rx: "76%", ry: "30%", color: "#ffffff", from: 0.08, mid: 0.02 },
];

const LIGHT_POOLS: Pool[] = [
  { cx: "50%", cy: "16%", rx: "72%", ry: "58%", color: "#ffffff", from: 0.9, mid: 0.4 },
  { cx: "0%", cy: "36%", rx: "44%", ry: "52%", color: "#8c9ec4", from: 0.16, mid: 0.04 },
  { cx: "100%", cy: "86%", rx: "48%", ry: "50%", color: "#baaa94", from: 0.14, mid: 0.04 },
  { cx: "50%", cy: "100%", rx: "76%", ry: "30%", color: "#000000", from: 0.05, mid: 0.01 },
];

// Glass needs something behind it. Over a flat page a blurred surface has
// nothing to refract and renders as a grey rectangle. This is the light the
// glass picks up: stacked radial pools, greyscale on purpose, inverting with
// the theme.
export function AmbientBackdrop() {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const dark = theme.mode === "dark";
  const pools = dark ? DARK_POOLS : LIGHT_POOLS;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.page }]}
    >
      <Svg width={width} height={height}>
        <Defs>
          {pools.map((pool, index) => (
            <RadialGradient
              key={index}
              id={`pool-${index}`}
              cx={pool.cx}
              cy={pool.cy}
              rx={pool.rx}
              ry={pool.ry}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={pool.color} stopOpacity={pool.from} />
              <Stop offset="0.44" stopColor={pool.color} stopOpacity={pool.mid} />
              <Stop offset="0.74" stopColor={pool.color} stopOpacity={0} />
            </RadialGradient>
          ))}
          <RadialGradient
            id="vignette"
            cx="50%"
            cy="14%"
            rx="140%"
            ry="105%"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0.6" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={dark ? 0.38 : 0.09} />
          </RadialGradient>
        </Defs>
        {pools.map((_, index) => (
          <Rect
            key={index}
            x="0"
            y="0"
            width={width}
            height={height}
            fill={`url(#pool-${index})`}
          />
        ))}
        <Rect x="0" y="0" width={width} height={height} fill="url(#vignette)" />
      </Svg>
    </View>
  );
}
