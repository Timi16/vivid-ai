// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "ios/*", "android/*", ".expo/*", "coverage/*"],
  },
  {
    rules: {
      // Features never import each other; the route composes them. The
      // same policy the web enforces with eslint-plugin-boundaries.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*/components/*", "@/features/*/hooks/*", "@/features/*/lib/*"],
              message:
                "Import a feature through its index (@/features/<name>) from routes only; a feature may not import a sibling feature.",
            },
          ],
        },
      ],
    },
  },
  {
    // Inside a feature, deep imports of its own files are the convention.
    files: ["features/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
]);
