// The languages Vivid speaks. "auto" lets the speech model detect the
// language of each voice turn; typed messages in an auto chat are answered in
// English.
export interface Language {
  code: string;
  label: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", label: "English" },
  { code: "pcm", label: "Pidgin" },
  { code: "yo", label: "Yorùbá" },
  { code: "ig", label: "Igbo" },
  { code: "en_ng", label: "Nigerian English" },
  { code: "auto", label: "Auto detect" },
];

export function languageLabel(code: string): string {
  return LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

// The empty state speaks whichever language the composer is set to, so picking
// Yorùbá changes the greeting and the placeholder, not just what comes back.
// Kept here beside LANGUAGES so adding a language is one edit, not three.
//
// Nigerian English and auto-detect fall back to English: the first is English,
// and the second has nothing to detect from until the user speaks.
const GREETINGS: Record<string, string> = {
  en: "What's on your mind today?",
  pcm: "Wetin dey your mind today?",
  yo: "Kí ló wà lọ́kàn rẹ lónìí?",
  ig: "Gịnị dị gị n'obi taa?",
};

const PROMPTS: Record<string, string> = {
  en: "Ask anything…",
  pcm: "Ask me anytin…",
  yo: "Béèrè ohunkóhun…",
  ig: "Jụọ ihe ọ bụla…",
};

export function greeting(code: string): string {
  return GREETINGS[code] ?? GREETINGS.en;
}

export function askPrompt(code: string): string {
  return PROMPTS[code] ?? PROMPTS.en;
}
