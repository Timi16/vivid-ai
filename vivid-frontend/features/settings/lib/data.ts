export interface Language {
  code: string;
  name: string;
  native: string;
}

// The five locales the sibling frontend ships. Listed here so the setting is
// real, though nothing is translated yet: next-intl is deliberately deferred
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

export interface Shortcut {
  keys: string[];
  action: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

// Written with the platform modifier resolved at render, so a Mac reader sees
// Command and everyone else sees Ctrl.
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: ["Mod", "K"], action: "Open search" },
      { keys: ["Mod", "N"], action: "New thread" },
      { keys: ["Mod", "/"], action: "Show shortcuts" },
      { keys: ["Mod", "\\"], action: "Toggle the sidebar" },
    ],
  },
  {
    title: "In a thread",
    shortcuts: [
      { keys: ["Enter"], action: "Send" },
      { keys: ["Shift", "Enter"], action: "New line" },
      { keys: ["Mod", "C"], action: "Copy the last answer" },
      { keys: ["Mod", "Shift", "E"], action: "Export the thread" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "H"], action: "Go to history" },
      { keys: ["G", "S"], action: "Go to spaces" },
      { keys: ["G", "A"], action: "Go to artifacts" },
      { keys: ["Esc"], action: "Close a dialog" },
    ],
  },
];
