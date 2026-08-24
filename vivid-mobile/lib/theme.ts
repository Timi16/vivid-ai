// Design tokens, ported from vivid-frontend/app/globals.css. The palette is
// monochrome: depth comes from luminance, and the light theme is the same
// greyscale run the other way. Token names match the web so a component moved
// between the two apps keeps its vocabulary.

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "vivid-theme";

export const THEME_OPTIONS: { value: ThemePreference; label: string; detail: string }[] = [
  { value: "system", label: "System", detail: "Follow your device setting." },
  { value: "dark", label: "Dark", detail: "The default. Built for long sessions." },
  { value: "light", label: "Light", detail: "The same palette, run the other way." },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ResolvedTheme {
  if (preference === "system") return prefersLight ? "light" : "dark";
  return preference;
}

export interface Colors {
  // Foreground, its inverse, and the page beneath the glass.
  fg: string;
  fgInvert: string;
  page: string;
  // Silver accent and the semantic up/down pair.
  accent: string;
  up: string;
  upInk: string;
  down: string;
  downInk: string;
  // Text on the bright (primary) surface.
  ink: string;
  arrow: string;
  panel: string;
  sheet: string;
  destructive: string;
}

export const DARK_COLORS: Colors = {
  fg: "#ffffff",
  fgInvert: "#0a0a0a",
  page: "#000000",
  accent: "#d4d4d8",
  up: "#7ce7b0",
  upInk: "#04241a",
  down: "#f6a5a5",
  downInk: "#2a0e0e",
  ink: "#0a0a0a",
  arrow: "#8a8a8f",
  panel: "#0a0a0a",
  sheet: "#0c0c0e",
  destructive: "#ef4444",
};

export const LIGHT_COLORS: Colors = {
  fg: "#18181b",
  fgInvert: "#fafafa",
  page: "#f2f2f4",
  accent: "#52525b",
  up: "#0f7a4f",
  upInk: "#eafff4",
  down: "#b3261e",
  downInk: "#fff1f0",
  ink: "#fafafa",
  arrow: "#6b6b72",
  panel: "#f7f7f8",
  sheet: "#ffffff",
  destructive: "#ef4444",
};

// One material, five weights. What changes between tiers is blur depth,
// how much light the surface carries, and how far it floats.
export type GlassTier = "base" | "control" | "card" | "sheet" | "well" | "bright";

export interface GlassStyle {
  backgroundColor: string;
  borderColor: string;
  // The specular line along the top edge.
  highlight: string;
  // Native blur intensity (0 to 100). Zero means no blur layer at all.
  blur: number;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffsetY: number;
}

const DARK_GLASS: Record<GlassTier, GlassStyle> = {
  base: {
    backgroundColor: "rgba(255,255,255,0.065)",
    borderColor: "rgba(255,255,255,0.12)",
    highlight: "rgba(255,255,255,0.2)",
    blur: 18,
    shadowOpacity: 0.42,
    shadowRadius: 14,
    shadowOffsetY: 8,
  },
  control: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.14)",
    highlight: "rgba(255,255,255,0.24)",
    blur: 0,
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffsetY: 2,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderColor: "rgba(255,255,255,0.12)",
    highlight: "rgba(255,255,255,0.2)",
    blur: 22,
    shadowOpacity: 0.45,
    shadowRadius: 17,
    shadowOffsetY: 10,
  },
  sheet: {
    backgroundColor: "rgba(255,255,255,0.075)",
    borderColor: "rgba(255,255,255,0.15)",
    highlight: "rgba(255,255,255,0.26)",
    blur: 40,
    shadowOpacity: 0.66,
    shadowRadius: 35,
    shadowOffsetY: 24,
  },
  well: {
    backgroundColor: "rgba(0,0,0,0.28)",
    borderColor: "rgba(255,255,255,0.08)",
    highlight: "rgba(0,0,0,0.5)",
    blur: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffsetY: 0,
  },
  bright: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: "rgba(255,255,255,0.62)",
    highlight: "rgba(255,255,255,0.95)",
    blur: 0,
    shadowOpacity: 0.38,
    shadowRadius: 7,
    shadowOffsetY: 2,
  },
};

const LIGHT_GLASS: Record<GlassTier, GlassStyle> = {
  base: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(0,0,0,0.1)",
    highlight: "rgba(255,255,255,0.9)",
    blur: 18,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffsetY: 8,
  },
  control: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(0,0,0,0.1)",
    highlight: "rgba(255,255,255,0.95)",
    blur: 0,
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffsetY: 2,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(0,0,0,0.1)",
    highlight: "rgba(255,255,255,0.9)",
    blur: 22,
    shadowOpacity: 0.1,
    shadowRadius: 17,
    shadowOffsetY: 10,
  },
  sheet: {
    backgroundColor: "rgba(255,255,255,0.86)",
    borderColor: "rgba(0,0,0,0.1)",
    highlight: "rgba(255,255,255,1)",
    blur: 40,
    shadowOpacity: 0.22,
    shadowRadius: 35,
    shadowOffsetY: 24,
  },
  well: {
    backgroundColor: "rgba(0,0,0,0.045)",
    borderColor: "rgba(0,0,0,0.1)",
    highlight: "rgba(0,0,0,0.08)",
    blur: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffsetY: 0,
  },
  bright: {
    backgroundColor: "rgba(24,24,27,0.94)",
    borderColor: "rgba(0,0,0,0.5)",
    highlight: "rgba(255,255,255,0.22)",
    blur: 0,
    shadowOpacity: 0.2,
    shadowRadius: 7,
    shadowOffsetY: 2,
  },
};

export interface Theme {
  mode: ResolvedTheme;
  colors: Colors;
  glass: Record<GlassTier, GlassStyle>;
  // Text tinted with the foreground at a given opacity: the web's text-fg/55.
  fg: (opacity: number) => string;
}

// "#ffffff" at 0.55 -> "rgba(255,255,255,0.55)". Only used with the hex
// tokens above, so the parser stays small.
export function alpha(hex: string, opacity: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export function buildTheme(mode: ResolvedTheme): Theme {
  const colors = mode === "light" ? LIGHT_COLORS : DARK_COLORS;
  return {
    mode,
    colors,
    glass: mode === "light" ? LIGHT_GLASS : DARK_GLASS,
    fg: (opacity) => alpha(colors.fg, opacity),
  };
}

// Corner radii shared across surfaces so a card and a sheet agree.
export const RADIUS = {
  control: 999,
  input: 14,
  card: 22,
  sheet: 22,
  row: 18,
  menuItem: 10,
} as const;

// Type ramp. Sizes are the web's pixel values; weights map to the Geist
// faces loaded at boot. Body copy runs at medium weight, matching the web.
export const FONT = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
} as const;
