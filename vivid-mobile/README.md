# Vivid mobile

The React Native (Expo) app for Vivid AI. It is a port of `vivid-frontend`: the
same screens, the same feature slices, and the same live integration with
`vivid-backend` (REST plus one websocket for streaming chat, dictation, and
hands-free calls).

## Stack

- Expo SDK 57, React Native 0.86, TypeScript strict, Expo Router (file-based routes)
- TanStack Query for server state; module stores for activity, toasts, tokens, search
- `@siteed/audio-studio` for live 16 kHz PCM mic streaming, `expo-audio` for playback
- `expo-web-browser` for "Continue with Google" through Decane's callback flow (no SDK)
- `expo-secure-store` for the token bundle, AsyncStorage for preferences and drafts
- `react-native-webview` for HTML previews and PDFs in the artifact panel
- `react-native-mathjax-svg` for LaTeX in answers (MathJax to SVG, no WebView)

## Setup

```sh
pnpm install
cp .env.example .env      # then fill in EXPO_PUBLIC_API_URL (a LAN IP, not localhost)
pnpm prebuild             # generates ios/ and android/
npx expo run:ios          # or: npx expo run:android
```

A **development build** is required. Expo Go cannot load the native modules
this app depends on (secure store, live audio, webview).

For Google sign-in, create a Decane API key for the mobile app in the same
project as the web app, register `vivid://auth` as its callback URL, and set
`EXPO_PUBLIC_DECANE_APP_ID` and `EXPO_PUBLIC_DECANE_API_KEY`. The backend must
have the matching `DECANE_APP_ID` and verification key.

Set `EXPO_PUBLIC_PREVIEW_FEATURES=1` to show the pages that have no service
behind them yet (Computer, Spaces, Customize, Discover).

## Scripts

| Script           | What it does                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `pnpm start`     | Metro dev server (open in the dev build)                                                  |
| `pnpm typecheck` | `tsc --noEmit`                                                                            |
| `pnpm lint`      | ESLint via `expo lint`                                                                    |
| `pnpm test`      | Jest (`jest-expo` preset)                                                                 |
| `pnpm format`    | Prettier                                                                                  |
| `pnpm prebuild`  | Regenerate native projects from `app.json`                                                |
| `pnpm brand`     | Redraw the splash, app icon and favicon into `assets/` (needs Google Chrome to rasterise) |

Run format, lint, typecheck and test before opening a pull request.

The splash screen and icons are drawn in `scripts/brand.mjs`: the Vivid bot beside the wordmark on the black brand ground, monochrome like the rest of the design. Edit the script, run `pnpm brand`, then `pnpm prebuild` so the native projects pick the new images up. The app opens dark by default, as the web does; System and Light are options in Settings, Appearance.

## Where things live

See `docs/ARCHITECTURE.md`. Short version: `app/` is routes only, `features/`
are vertical slices that never import each other, `components/ui/` is the
design system, `lib/` is framework-free.
