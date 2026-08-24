import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Rect, RadialGradient, Stop } from "react-native-svg";

import { useTheme } from "@/hooks/use-theme";

// Glass needs something behind it. Over a flat page a blurred surface has
// nothing to refract and renders as a grey rectangle. This is the light the
// glass picks up: stacked radial pools, greyscale on purpose, inverting with
// the theme. Ported from the vd-ambient utility in the web's globals.css.
export function AmbientBackdrop() {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const dark = theme.mode === "dark";

  const pools = dark
    ? [
        { cx: "50%", cy: "16%", rx: "72%", ry: "58%", from: "rgba(255,255,255,0.24)", mid: "rgba(255,255,255,0.07)" },
        { cx: "0%", cy: "36%", rx: "44%", ry: "52%", from: "rgba(202,214,240,0.2)", mid: "rgba(202,214,240,0.05)" },
        { cx: "100%", cy: "86%", rx: "48%", ry: "50%", from: "rgba(242,235,224,0.16)", mid: "rgba(242,235,224,0.04)" },
        { cx: "50%", cy: "100%", rx: "76%", ry: "30%", from: "rgba(255,255,255,0.08)", mid: "rgba(255,255,255,0.02)" },
      ]
    : [
        { cx: "50%", cy: "16%", rx: "72%", ry: "58%", from: "rgba(255,255,255,0.9)", mid: "rgba(255,255,255,0.4)" },
        { cx: "0%", cy: "36%", rx: "44%", ry: "52%", from: "rgba(140,158,196,0.16)", mid: "rgba(140,158,196,0.04)" },
        { cx: "100%", cy: "86%", rx: "48%", ry: "50%", from: "rgba(186,170,148,0.14)", mid: "rgba(186,170,148,0.04)" },
        { cx: "50%", cy: "100%", rx: "76%", ry: "30%", from: "rgba(0,0,0,0.05)", mid: "rgba(0,0,0,0.01)" },
      ];

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.page }]}>
      <Svg width={width} height={height}>
        <Defs>
          {pools.map((pool, index) => (
            <RadialGradient key={index} id={`pool-${index}`} cx={pool.cx} cy={pool.cy} rx={pool.rx} ry={pool.ry} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={pool.from} />
              <Stop offset="0.44" stopColor={pool.mid} />
              <Stop offset="0.74" stopColor="rgba(0,0,0,0)" />
            </RadialGradient>
          ))}
          <RadialGradient id="vignette" cx="50%" cy="14%" rx="140%" ry="105%" gradientUnits="userSpaceOnUse">
            <Stop offset="0.6" stopColor="rgba(0,0,0,0)" />
            <Stop offset="1" stopColor={dark ? "rgba(0,0,0,0.38)" : "rgba(0,0,0,0.09)"} />
          </RadialGradient>
        </Defs>
        {pools.map((_, index) => (
          <Rect key={index} x="0" y="0" width={width} height={height} fill={`url(#pool-${index})`} />
        ))}
        <Rect x="0" y="0" width={width} height={height} fill="url(#vignette)" />
      </Svg>
    </View>
  );
}
