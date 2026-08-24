import { describe, expect, it } from "vitest";

import { isThemePreference, resolveTheme, THEME_INIT_SCRIPT } from "@/lib/theme";

describe("resolveTheme", () => {
  it("returns the explicit choice regardless of the device", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("follows the device when set to system", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });
});

describe("isThemePreference", () => {
  it("accepts the three known values", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
  });

  it("rejects anything else, so a stale storage value cannot be applied", () => {
    expect(isThemePreference("sepia")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("is wrapped in try/catch, since localStorage throws when storage is blocked", () => {
    expect(THEME_INIT_SCRIPT).toContain("try{");
    expect(THEME_INIT_SCRIPT).toContain("catch(e){}");
  });

  it("only ever sets the light attribute, because dark is the default", () => {
    expect(THEME_INIT_SCRIPT).toContain('setAttribute("data-theme","light")');
    expect(THEME_INIT_SCRIPT).not.toContain('"dark")');
  });
});
