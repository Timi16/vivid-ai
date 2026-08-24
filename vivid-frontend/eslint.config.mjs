import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["app/**", "features/**", "components/**", "hooks/**", "lib/**"],
      // partialMatch: false on every descriptor. Patterns match partially by
      // default, so `lib/**` would also match the `lib/` folder inside a slice
      // and misattribute the error.
      "boundaries/elements": [
        { type: "feature", pattern: "features/*", capture: ["name"], partialMatch: false },
        { type: "app", pattern: "app/**", partialMatch: false },
        { type: "ui", pattern: "components/ui/**", partialMatch: false },
        // The shell composes features, so it is the one place below app/ that
        // may import them.
        { type: "layout", pattern: "components/layout/**", partialMatch: false },
        { type: "shared-ui", pattern: "components/**", partialMatch: false },
        { type: "hooks", pattern: "hooks/**", partialMatch: false },
        { type: "lib", pattern: "lib/**", partialMatch: false },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: [{ element: { type: "feature" } }],
              disallow: [{ to: { element: { type: "feature", name: "!{{from.name}}" } } }],
              message: "A feature may not import another feature. The route composes them.",
            },
            {
              from: [{ element: { type: ["lib", "ui", "hooks", "shared-ui"] } }],
              disallow: [{ to: { element: { type: ["feature", "app", "layout"] } } }],
              message:
                "lib, components/ui and hooks sit below features and must not import upward.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
