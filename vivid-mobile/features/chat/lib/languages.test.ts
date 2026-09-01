import { LANGUAGES, askPrompt, greeting, languageLabel } from "./languages";

describe("empty-state copy", () => {
  it("greets in each language the picker offers a translation for", () => {
    expect(greeting("en")).toBe("What's on your mind today?");
    expect(greeting("pcm")).toBe("Wetin dey your mind today?");
    expect(greeting("yo")).toBe("Kí ló wà lọ́kàn rẹ lónìí?");
    expect(greeting("ig")).toBe("Gịnị dị gị n'obi taa?");
  });

  it("prompts in each of those languages too", () => {
    expect(askPrompt("en")).toBe("Ask anything…");
    expect(askPrompt("pcm")).toBe("Ask me anytin…");
    expect(askPrompt("yo")).toBe("Béèrè ohunkóhun…");
    expect(askPrompt("ig")).toBe("Jụọ ihe ọ bụla…");
  });

  it("falls back to English for the codes with no copy of their own", () => {
    // Nigerian English is English, and auto-detect has nothing to detect from
    // until the user speaks, so both read as English rather than blank.
    expect(greeting("en_ng")).toBe(greeting("en"));
    expect(greeting("auto")).toBe(greeting("en"));
    expect(askPrompt("en_ng")).toBe(askPrompt("en"));
    expect(askPrompt("auto")).toBe(askPrompt("en"));
  });

  it("never leaves a language in the picker without copy to show", () => {
    // The guard that matters: adding a language to LANGUAGES and forgetting
    // the strings would silently ship an English greeting under a Yorùbá label.
    for (const language of LANGUAGES) {
      expect(greeting(language.code)).toBeTruthy();
      expect(askPrompt(language.code)).toBeTruthy();
      expect(languageLabel(language.code)).toBe(language.label);
    }
  });

  it("falls back rather than throwing on a code it has never seen", () => {
    expect(greeting("zz")).toBe(greeting("en"));
    expect(askPrompt("zz")).toBe(askPrompt("en"));
  });
});
