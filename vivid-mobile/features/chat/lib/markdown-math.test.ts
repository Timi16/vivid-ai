import MarkdownIt from "markdown-it";

import { markdownMath } from "./markdown-math";

const md = new MarkdownIt().use(markdownMath);

function inlineTokens(source: string) {
  const [paragraph] = md.parse(source, {}).filter((t) => t.type === "inline");
  return paragraph?.children?.map((t) => [t.type, t.content]) ?? [];
}

describe("markdownMath", () => {
  it("tokenises inline math", () => {
    expect(inlineTokens("Euler: $e^{i\\pi} + 1 = 0$ done")).toEqual([
      ["text", "Euler: "],
      ["math_inline", "e^{i\\pi} + 1 = 0"],
      ["text", " done"],
    ]);
  });

  it("leaves money alone", () => {
    expect(inlineTokens("It costs $5 and $10 today")).toEqual([
      ["text", "It costs $5 and $10 today"],
    ]);
  });

  it("tokenises display math on one line and across lines", () => {
    const single = md.parse("$$ a^2 + b^2 = c^2 $$", {});
    expect(single.map((t) => t.type)).toEqual(["math_block"]);
    expect(single[0].content).toBe("a^2 + b^2 = c^2");

    const multi = md.parse("Before\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nAfter", {});
    const block = multi.find((t) => t.type === "math_block");
    expect(block?.content).toBe("\\int_0^1 x\\,dx");
    expect(multi.filter((t) => t.type === "paragraph_open")).toHaveLength(2);
  });

  it("treats double dollars inside a line as display math", () => {
    expect(inlineTokens("so $$x$$ there")).toEqual([
      ["text", "so "],
      ["math_block", "x"],
      ["text", " there"],
    ]);
  });
});
