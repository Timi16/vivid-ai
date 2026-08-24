import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import {
  buildTheme,
  isThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type Theme,
  type ThemePreference,
} from "@/lib/theme";
import { preferences } from "@/lib/storage";

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  // Read from storage before the first render so the app never flashes the
  // wrong theme, mirroring the web's inline head script.
  initialPreference: ThemePreference;
  children: React.ReactNode;
}

export function ThemeProvider({ initialPreference, children }: ThemeProviderProps) {
  const scheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void preferences.set(THEME_STORAGE_KEY, next);
  }, []);

  const theme = useMemo(
    () => buildTheme(resolveTheme(preference, scheme === "light")),
    [preference, scheme]
  );

  const value = useMemo(
    () => ({ theme, preference, setPreference }),
    [theme, preference, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export async function readThemePreference(): Promise<ThemePreference> {
  const stored = await preferences.get(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

// Runs an effect when the resolved theme changes. Used by the root layout to
// keep the status bar and system UI in step.
export function useThemeEffect(effect: (theme: Theme) => void) {
  const { theme } = useTheme();
  useEffect(() => effect(theme), [theme, effect]);
}
