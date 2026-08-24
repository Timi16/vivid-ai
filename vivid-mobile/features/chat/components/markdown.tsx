import { useMemo } from "react";
import { Linking } from "react-native";
import MarkdownDisplay from "react-native-markdown-display";

import { useTheme } from "@/hooks/use-theme";
import { FONT } from "@/lib/theme";

// Assistant text is markdown (code blocks, lists, tables). The web also
// renders LaTeX through KaTeX; there is no native KaTeX, so math arrives as
// its source text here. TODO(math): render $...$ once a native math view is
// chosen; until then the formula is at least readable.
export function Markdown({ children }: { children: string }) {
  const { theme } = useTheme();
  const styles = useMemo(() => {
    const fg = theme.colors.fg;
    const body = { color: theme.fg(0.85), fontFamily: FONT.regular, fontSize: 15, lineHeight: 26 };
    return {
      body,
      paragraph: { marginTop: 5, marginBottom: 5 },
      heading1: { ...body, fontFamily: FONT.semibold, fontSize: 16, marginTop: 14, marginBottom: 6 },
      heading2: { ...body, fontFamily: FONT.semibold, fontSize: 16, marginTop: 14, marginBottom: 6 },
      heading3: { ...body, fontFamily: FONT.semibold, fontSize: 16, marginTop: 14, marginBottom: 6 },
      strong: { fontFamily: FONT.semibold },
      em: { fontStyle: "italic" as const },
      link: { color: fg, textDecorationLine: "underline" as const },
      bullet_list: { marginVertical: 5 },
      ordered_list: { marginVertical: 5 },
      list_item: { marginVertical: 2 },
      bullet_list_icon: { color: theme.fg(0.6), marginLeft: 6, marginRight: 8, fontSize: 15, lineHeight: 26 },
      ordered_list_icon: { color: theme.fg(0.6), marginLeft: 6, marginRight: 8, fontSize: 15, lineHeight: 26 },
      code_inline: {
        backgroundColor: theme.fg(0.08),
        color: fg,
        borderRadius: 5,
        paddingHorizontal: 5,
        fontSize: 13,
        fontFamily: "Menlo",
      },
      fence: {
        backgroundColor: theme.fg(0.92),
        color: theme.colors.fgInvert,
        borderColor: "transparent",
        borderRadius: 12,
        padding: 14,
        fontSize: 13,
        lineHeight: 20,
        fontFamily: "Menlo",
        marginVertical: 10,
      },
      code_block: {
        backgroundColor: theme.fg(0.92),
        color: theme.colors.fgInvert,
        borderColor: "transparent",
        borderRadius: 12,
        padding: 14,
        fontSize: 13,
        lineHeight: 20,
        fontFamily: "Menlo",
        marginVertical: 10,
      },
      blockquote: {
        backgroundColor: "transparent",
        borderLeftWidth: 3,
        borderLeftColor: theme.fg(0.25),
        paddingLeft: 14,
        marginLeft: 0,
        opacity: 0.85,
        marginVertical: 10,
      },
      table: { borderWidth: 1, borderColor: theme.fg(0.15), borderRadius: 6, marginVertical: 10 },
      thead: {},
      tr: { borderBottomWidth: 1, borderColor: theme.fg(0.15) },
      th: { padding: 8, fontFamily: FONT.semibold },
      td: { padding: 8 },
      hr: { backgroundColor: theme.fg(0.15), height: 1, marginVertical: 12 },
    };
  }, [theme]);

  return (
    <MarkdownDisplay
      style={styles}
      onLinkPress={(url) => {
        void Linking.openURL(url);
        return false;
      }}
    >
      {children}
    </MarkdownDisplay>
  );
}
