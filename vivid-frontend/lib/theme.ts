export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "vivid-theme";

export const THEME_OPTIONS: { value: ThemePreference; label: string; detail: string }[] = [
  { value: "system", label: "System", detail: "Follow your device setting." },
  { value: "dark", label: "Dark", detail: "The default. Built for long sessions." },
  { value: "light", label: "Light", detail: "The same palette, run the other way." },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

// Dark is the brand default, so it is the absence of an attribute. Only light
// is marked, which keeps the selector cost to one rule set.
export function resolveTheme(preference: ThemePreference, prefersLight: boolean): "light" | "dark" {
  if (preference === "system") return prefersLight ? "light" : "dark";
  return preference;
}

export function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  if (resolved === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
}

/**
 * Runs synchronously in <head>, before the browser paints, so a light-theme
 * reader never sees a dark flash on load. Deferring this to an effect would
 * paint the default first and then correct it, which is the exact flash this
 * avoids.
 *
 * Kept as a string because it has to be inlined; it cannot import anything.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var l=p==="light"||((!p||p==="system")&&window.matchMedia("(prefers-color-scheme: light)").matches);if(l)document.documentElement.setAttribute("data-theme","light")}catch(e){}})()`;
