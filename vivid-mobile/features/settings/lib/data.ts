export interface Language {
  code: string;
  name: string;
  native: string;
}

// The five locales the sibling frontend ships. Listed here so the setting is
// real, though nothing is translated yet: localisation is deliberately deferred
// until a second locale is actually needed.
export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "pt", name: "Portuguese", native: "Português" },
];

export interface NotificationSetting {
  id: string;
  label: string;
  detail: string;
  defaultOn: boolean;
}

export const NOTIFICATION_SETTINGS: NotificationSetting[] = [
  {
    id: "task-complete",
    label: "Task finished",
    detail: "When a Computer run completes or needs you.",
    defaultOn: true,
  },
  {
    id: "generation-ready",
    label: "Generation ready",
    detail: "When an image, video or audio clip finishes rendering.",
    defaultOn: true,
  },
  {
    id: "mentions",
    label: "Shared thread activity",
    detail: "When someone comments on a thread you shared.",
    defaultOn: false,
  },
  {
    id: "product",
    label: "Product updates",
    detail: "New models and features. At most once a month.",
    defaultOn: false,
  },
];
