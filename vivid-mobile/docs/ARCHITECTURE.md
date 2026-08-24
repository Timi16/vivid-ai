# Mobile architecture

This app mirrors `vivid-frontend/docs/ARCHITECTURE.md`. Read that first; this
file only records where mobile differs and why.

## The rule, unchanged

Four layers, imports point down:

```
app/                Expo Router routes. Composes features, owns no logic.
components/layout/  the shell: drawer, topbar, search palette, ambient light.
features/           vertical slices. Never import a sibling.
components/ui/      design system primitives. Know nothing about any feature.
hooks/              cross-cutting React hooks (theme, profile, network).
lib/                pure cross-cutting: backend client, theme tokens, storage.
```

`eslint.config.js` enforces the feature boundary: only routes and the shell
import a feature, and only through its `index.ts`.

## Routes

```
app/_layout.tsx           providers, fonts, boot (tokens + theme), the auth guard
app/(auth)/               sign-in, verify, onboarding. No shell.
app/(app)/_layout.tsx     the drawer shell (the web's sidebar + topbar) and the search palette
app/(app)/index.tsx       home: ChatLauncher, first-run copy decided by history
app/(app)/thread/[id].tsx the live thread
app/(app)/{artifacts,history,settings,upgrade}.tsx
app/(app)/{computer,spaces,customize,discover}.tsx   preview-only (EXPO_PUBLIC_PREVIEW_FEATURES=1)
```

The auth gate is `Stack.Protected` in the root layout, keyed on the token store.
Signing in sets tokens; signing out (or a failed refresh) clears them; the router
swaps the whole shell. No screen ever navigates to `/sign-in` by hand.

## Data flow

```
component -> hook (TanStack Query) -> lib/backend/client -> FastAPI
                                   -> lib/backend/ws     -> FastAPI websocket
```

The phone talks to the backend directly, like the web's chat path. There is no
BFF: a phone cannot hold a secret any better than a browser, so nothing here
needs one. The backend's CORS and JWT rules are the boundary.

## What is different from the web

| Web                                   | Mobile                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| Tailwind utilities + `vd-glass-*` CSS | `lib/theme.ts` tokens + `<Glass tier>` primitive          |
| `localStorage` token bundle           | `expo-secure-store`, mirrored in memory                   |
| `sessionStorage` handoffs and drafts  | in-memory handoff map; AsyncStorage drafts                |
| Web Audio `ScriptProcessor` mic       | `@siteed/audio-studio` float32 stream -> `toPcm16`        |
| `<audio>` playback queue              | `expo-audio` players over cache files                     |
| Google: full-page redirect to Decane  | Google: `openAuthSessionAsync` sheet, `vivid://auth` back |
| Sidebar hover actions on a chat       | long press opens pin / rename / delete                    |
| Popover menus, ⌘K palette             | bottom-sheet `Menu`, search button opens the palette      |
| Artifact panel beside the chat        | artifact sheet over the chat (`react-native-webview`)     |
| KaTeX math in answers                 | MathJax to SVG (`react-native-mathjax-svg`), no WebView   |
| Shortcut labels from `navigator`      | modifier label from `Platform.OS` (⌘ on iOS, Ctrl else)   |

Everything else, including the streaming hook, the VAD constants, the edit and
truncate flow, the language picker, and the fixture-backed preview screens, is
a direct port.

## Voice

`lib/backend/audio.ts` is the seam. The mic is a hook (`usePcmStreamer`) because
the native recorder delivers samples through one; `use-live-thread` owns it and
runs the same RMS voice-activity detection as the web (threshold 0.015, 1000 ms
of silence ends the turn). Playback is module state, exactly as on the web:
`playWavBase64` queues clause-sized clips, `setPlaybackIdleCallback` reopens the
mic when the reply finishes.

## Markdown and math

`features/chat/components/markdown.tsx` owns one `markdown-it` parser with
`features/chat/lib/markdown-math.ts`, a plugin that tokenises `$...$` and
`$$...$$` exactly like the web's remark-math. `TexMath` renders each token
through MathJax's TeX input and SVG output in pure JS, memoised per formula,
and falls back to the TeX source if MathJax rejects it.

## Google sign-in

`lib/backend/decane.ts` calls Decane's `/auth/google/init` for a consent URL,
opens it in the system auth sheet, and reads `decane_jwt` (plus the display
profile) off the `vivid://auth` return. That token is what `POST /v1/auth/decane`
verifies. No Decane SDK: the SDKs are wallet kits and would demand a passkey or
PIN for a wallet Vivid never uses. The mobile API key must be registered with
`vivid://auth` as its callback URL.
