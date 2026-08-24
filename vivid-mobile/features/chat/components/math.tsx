import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { texToSvg } from "react-native-mathjax-svg";
import { SvgFromXml } from "react-native-svg";

import { AppText } from "@/components/ui/text";
import { useTheme } from "@/hooks/use-theme";

interface MathProps {
  tex: string;
  display?: boolean;
}

// TeX rendered by MathJax to SVG, in pure JS: no WebView, no native module.
// The conversion is memoised because MathJax is not cheap and a streaming
// reply re-renders many times. A formula MathJax rejects falls back to its
// source text rather than an empty box.
export function TexMath({ tex, display = false }: MathProps) {
  const { theme } = useTheme();
  const fontSize = display ? 17 : 15;
  const color = theme.fg(0.9);

  const svg = useMemo(() => {
    try {
      // The library halves the size it is given.
      const xml = texToSvg(tex, fontSize / 2);
      return xml ? xml.replace(/currentColor/g, color) : null;
    } catch {
      return null;
    }
  }, [tex, fontSize, color]);

  if (!svg) {
    return (
      <AppText mono size={13} tone={0.8}>
        {display ? `$$${tex}$$` : `$${tex}$`}
      </AppText>
    );
  }

  if (display) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
        <SvgFromXml xml={svg} />
      </ScrollView>
    );
  }
  return (
    <View style={{ transform: [{ translateY: 3 }] }}>
      <SvgFromXml xml={svg} />
    </View>
  );
}
