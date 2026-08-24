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
