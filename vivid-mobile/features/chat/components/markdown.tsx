import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import MarkdownDisplay, { type ASTNode, type RenderRules } from "react-native-markdown-display";

import { CopyIcon } from "@/components/ui/icons";
import { AppText } from "@/components/ui/text";
import type { Artifact } from "@/features/chat/lib/artifacts";
import { useTheme } from "@/hooks/use-theme";
import { copyText } from "@/lib/clipboard";
import { FONT } from "@/lib/theme";

interface MarkdownProps {
  children: string;
  // When given, fenced code blocks get an "Open" action that hands the block
  // to the artifact panel.
  onOpenArtifact?: (artifact: Artifact) => void;
}

// Assistant text is markdown (code blocks, lists, tables). The web also
// renders LaTeX through KaTeX; there is no native KaTeX, so math arrives as
// its source text here. TODO(math): render $...$ once a native math view is
// chosen; until then the formula is at least readable.
export function Markdown({ children, onOpenArtifact }: MarkdownProps) {
  const { theme } = useTheme();

  const styles = useMemo(() => {
    const fg = theme.colors.fg;
    const body = { color: theme.fg(0.85), fontFamily: FONT.regular, fontSize: 15, lineHeight: 26 };
    return {
      body,
      paragraph: { marginTop: 5, marginBottom: 5 },
      heading1: {
        ...body,
        fontFamily: FONT.semibold,
        fontSize: 16,
        marginTop: 14,
        marginBottom: 6,
      },
      heading2: {
        ...body,
        fontFamily: FONT.semibold,
        fontSize: 16,
        marginTop: 14,
        marginBottom: 6,
      },
      heading3: {
        ...body,
        fontFamily: FONT.semibold,
        fontSize: 16,
        marginTop: 14,
        marginBottom: 6,
      },
      strong: { fontFamily: FONT.semibold },
      em: { fontStyle: "italic" as const },
      link: { color: fg, textDecorationLine: "underline" as const },
      bullet_list: { marginVertical: 5 },
      ordered_list: { marginVertical: 5 },
      list_item: { marginVertical: 2 },
      bullet_list_icon: {
        color: theme.fg(0.6),
        marginLeft: 6,
        marginRight: 8,
        fontSize: 15,
        lineHeight: 26,
      },
      ordered_list_icon: {
        color: theme.fg(0.6),
        marginLeft: 6,
        marginRight: 8,
        fontSize: 15,
        lineHeight: 26,
      },
      code_inline: {
        backgroundColor: theme.fg(0.08),
        color: fg,
        borderRadius: 5,
        paddingHorizontal: 5,
        fontSize: 13,
        fontFamily: "Menlo",
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

  // Fenced and indented code blocks render through CodeBlock so they carry a
  // header with the language, a copy action and, when a handler is given, an
  // "Open" action.
  const rules = useMemo<RenderRules>(
    () => ({
      fence: (node: ASTNode) => (
        <CodeBlock
          key={node.key}
          language={fenceLanguage(node)}
          code={String(node.content ?? "").replace(/\n$/, "")}
          onOpen={onOpenArtifact}
        />
      ),
      code_block: (node: ASTNode) => (
        <CodeBlock
          key={node.key}
          language="text"
          code={String(node.content ?? "").replace(/\n$/, "")}
          onOpen={onOpenArtifact}
        />
      ),
    }),
    [onOpenArtifact]
  );

  return (
    <MarkdownDisplay
      style={styles}
      rules={rules}
      onLinkPress={(url) => {
        void Linking.openURL(url);
        return false;
      }}
    >
      {children}
    </MarkdownDisplay>
  );
}

// The fence's info string ("```python") is on the markdown-it token as
// `sourceInfo`, which the library's ASTNode typing leaves out.
function fenceLanguage(node: ASTNode): string {
  const info = (node as ASTNode & { sourceInfo?: string }).sourceInfo ?? "";
  return (info.trim().split(/\s+/)[0] || "text").toLowerCase();
}

function CodeBlock({
  language,
  code,
  onOpen,
}: {
  language: string;
  code: string;
  onOpen?: (artifact: Artifact) => void;
}) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

  return (
    <View
      style={{
        marginVertical: 12,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: theme.fg(0.05),
        borderWidth: 1,
        borderColor: theme.fg(0.1),
      }}
    >
      <View
        style={{
          height: 32,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 12,
          backgroundColor: theme.fg(0.06),
        }}
      >
        <AppText size={11.5} tone={0.55} style={{ flex: 1, textTransform: "lowercase" }}>
          {language}
        </AppText>
        {onOpen ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onOpen({ kind: "code", title: `${language} snippet`, language, content: code })
            }
            hitSlop={8}
          >
            <AppText size={11.5} tone={0.55}>
              Open
            </AppText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy code"
          hitSlop={8}
          onPress={async () => {
            await copyText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <CopyIcon size={12} color={theme.fg(0.55)} />
          <AppText size={11.5} tone={0.55}>
            {copied ? "Copied" : "Copy"}
          </AppText>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <AppText mono size={12.5} tone={0.85} lineHeight={20} style={{ padding: 14 }}>
          {code}
        </AppText>
      </ScrollView>
    </View>
  );
}
