# Frontend Architecture

How this frontend is structured and why. Read it before adding a directory, a
transport, or a shared component.

This app shares its architecture with the Worldstreet frontend
(`wsws-frontend`). The two sit under one company, so the layering, the transport
shape, the design tokens and the review bar are deliberately the same. A change
that would be rejected there is rejected here.

- `.claude/skills/wsws-engineering-standards/SKILL.md` is the coding bar.
- `README.md` is setup and scripts.

---

## 1. The rule

Four layers. Every import points downward. That is the whole model.

```
app/                routes and BFF handlers. Composes features, owns no logic.
   |  may import
components/layout/  the app shell. The one place below app/ that composes features.
   |  may import
features/           vertical slices. Never import a sibling.
   |  may import
components/ui/      design system primitives. Know nothing about any feature.
hooks/              cross-cutting React hooks. Same rule, same layer.
   |  may import
lib/                pure cross-cutting: api client, format, utils.
```

`components/ui/` and `hooks/` are siblings on the shared layer: one holds
presentation primitives, the other behaviour every feature needs. `lib/` sits
below both and stays framework-free, which is why a hook cannot live there.

### Four consequences

1. **Features never import each other, not even through the index.** They are
   siblings; the route composes them. See [section 4](#4-composing-across-features).
2. **`lib/` is for what two or more features need.** If only chat uses it, it
   belongs in `features/chat/lib/`.
3. **A hook belongs in `hooks/` when it is generic behaviour, not when it has
   many callers.** `useDebouncedValue` lives there with one caller, because
   nothing about it is tied to the feature that happens to use it.
4. **Anything a route handler needs belongs in `lib/server/`.** Importing a
   slice barrel into a route handler drags client components into the server
   bundle. The lint rules allow it, so this one is on you.

### Deciding where a component belongs

Judge membership of `components/ui/` by whether the component knows anything
about a feature, not by how many places import it. A `Switch` is a primitive
even if used once. A composer that understands prompts and models is a feature
component.

---

## 2. Structure

```
app/                    routes and BFF only
  api/                  one folder per upstream path
  (app)/                everything behind the shell
  (auth)/               sign-in, verify, onboarding. No shell.
  layout.tsx  providers.tsx  globals.css

features/               vertical slices. Each owns its whole vertical.
  <slice>/
    components/
    hooks/
    lib/                pure, unit tested
    index.ts            the only thing outside may import

components/
  ui/                   design system
  layout/               app-shell, sidebar, topbar, menus, nav-items

hooks/                  generic cross-cutting hooks
lib/                    cross-cutting only
  api.ts                apiFetch
  api/                  envelope.ts, service.ts, schemas/
  server/               server only. A client import must fail.
  format.ts  theme.ts  clipboard.ts  utils.ts

config/                 app metadata
docs/                   this file
```

The ten slices: `artifacts`, `auth`, `billing`, `chat`, `computer`, `customize`,
`discover`, `history`, `settings`, `spaces`, plus `system` for the health check.

Tests sit beside the code they cover and take its name, so `suggestions.ts` is
covered by `suggestions.test.ts` in the same folder and a slice can be read,
moved, or deleted with its tests attached.

---

## 3. Data flow

```
component -> hook (TanStack Query) -> feature lib client -> app/api/<path> -> FastAPI
```

- A component never calls `fetch` directly and never holds a base URL.
- Every upstream call goes through a route handler in `app/api/`. The handler
  holds the base URL, and any future secret, and validates the response.
- `VIVID_API_BASE_URL` is server-side only. It is deliberately not a
  `NEXT_PUBLIC_` variable. If a key would end up in one, the design is wrong.
- One transport. `createServiceClient(basePath, fallbackMessage)` in
  `lib/api/service.ts` defines a service by those two facts. Do not write
  another wrapper.
- The backend speaks plain JSON. The route handler puts the
  `{ success, data | error }` envelope on and `lib/api/envelope.ts` takes it off,
  so every feature fails the same way and a component never sees a raw upstream
  shape. That normalisation happens at the same boundary as validation, which is
  the point of having a boundary.
- Upstream payloads are validated by a Zod schema in `lib/api/schemas/` before
  they leave `lib/server/upstream.ts`. Validation failures log the reason and
  return `BAD_RESPONSE`; the schema internals never reach the browser.
- Pure derivation and formatting live in a `lib/` file with tests. Components
  render, hooks orchestrate.

---

## 4. Composing across features

A feature may not import another feature. When one feature's view has to show
another's, the route composes them. Which pattern depends on who owns the state.

**Static child: pass a slot.** The chat launcher shows the backend status, and
neither owns the other's state:

```tsx
// app/page.tsx
<ChatLauncher statusSlot={<BackendStatus />} />
```

**The feature triggers, the route owns the modal: raise a callback.** The
feature raises `onOpenThing(payload)` and the route renders the sheet.

**The feature owns the state and is too large to safely reshape: take a render
prop.** Prefer the first two.

If two slices keep reaching for each other, that is evidence they are one
feature. Merging them is the correct response.

---

## 5. Conventions

**Feature public surface.** Each slice exports only what others may use:

```ts
// features/system/index.ts
export { BackendStatus } from "./components/backend-status";
export { useHealth, healthQueryKey } from "./hooks/use-health";
```

**Naming.** Files are kebab-case. Components are PascalCase and named for what
they are. Hooks are `use<Thing>`. A pure module is named for its domain, not its
shape: `suggestions.ts`, `format.ts`, never `helpers.ts`.

**Variants.** Primitives take a `variant`/`size` prop, mirror it onto a
`data-*` attribute, and look the value up in a plain record. There is no
`class-variance-authority` here, matching the sibling repo.

**Size.** A component over roughly 300 lines is usually holding three jobs:
server state, derivation, and layout. Extract the first two.

**Server components.** Default to server. Reach for `"use client"` only for
interactivity, browser APIs, or client state, and push the boundary as deep as
possible.

---

## 5a. The design system

One material, five weights. Every button, card, menu and sheet is the same
glass; what changes is blur depth, radius and how far the surface floats.

| Utility            | Use                                              |
| ------------------ | ------------------------------------------------ |
| `vd-glass`         | Base material. The shell chrome.                 |
| `vd-glass-control` | Buttons, chips, pills, toolbar items.            |
| `vd-glass-card`    | Panels, tiles, list rows, the composer.          |
| `vd-glass-sheet`   | Modals, menus, popovers. The heaviest blur.      |
| `vd-glass-well`    | Inputs and quotes. Reads as cut in, not floating.|
| `vd-glass-bright`  | The primary action. Bright, still refracting.    |
| `vd-sheen`         | The specular streak. Pair with any tier.         |
| `vd-glass-hover`   | Hover lift, so a card and a button match.        |

Three things make a surface read as glass rather than a grey box: `saturate()`
in the backdrop filter, a bright inset line along the top edge, and a soft
ambient shadow underneath. All three are in the tiers; do not rebuild them by
hand.

**Glass needs light behind it.** `AmbientBackdrop` paints the pools the glass
refracts. Without it every surface is a grey rectangle, which is what the first
build looked like. It is painted as stacked radial gradients, not blurred divs:
a CSS blur spreads a soft gradient's peak and dilutes it.

**Never name a colour.** Use `text-fg`, `bg-fg/10`, `border-fg/12`, `ring-page`,
and the intent tokens (`text-up`, `text-down`, `text-accent`). A literal
`text-white` compiles to a fixed value and cannot be themed.

**Two `@theme` blocks, and the difference matters.** `@theme inline` substitutes
the literal value into every utility, so a token declared there can never be
overridden at runtime. Tokens that change with the theme belong in the plain
`@theme` block, which emits `var(--token)` instead. Getting this wrong produces
a light theme where the surfaces invert and the text does not.

---

## 6. Enforcement

Structure that is not enforced decays. These are the mechanisms.

**`eslint-plugin-boundaries`** in `eslint.config.mjs` types every folder and
runs two policies: a feature may not import another feature, and `lib`,
`components/ui`, `hooks` and the rest of `components/` may not import upward
into `features`, `app` or `layout`. A violation fails `pnpm lint`.

One trap if you edit that config: element patterns match partially by default,
so `lib/**` also matches the `lib/` folder inside a slice and misattributes
errors until every descriptor sets `partialMatch: false`.

**The five gates**, in the order CI runs them: `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build`. Typecheck is separate from build
because `next build` only checks what the build graph reaches.

**Adding a top-level directory means editing `app/globals.css`.** Tailwind runs
with `source(none)`, so it scans only the directories listed in the `@source`
lines. A class used only in an unlisted directory is dropped from the stylesheet
with no error and no warning: the component renders unstyled while typecheck,
lint, tests and the build all stay green.

---

## 7. What is left

The scaffold is in place. None of the following blocks work.

- [ ] **Endpoints.** Every screen is built; only `GET /api/health` is real.
      Each slice reads its list through a hook backed by one fixture file, so
      going live is a change to the `queryFn`, not to the view.
- [ ] **Auth.** `apiFetch` has the seam for it and takes no tokens today. The
      sign-in and onboarding submit handlers are where the real calls go.
- [ ] **Playwright specs** against a preview deployment, once there are flows
      worth driving end to end.

---

## 8. Open decisions

Recorded so they are chosen rather than defaulted into.

1. **The backend is one endpoint.** `GET /api/health` is all `vivid-backend`
   exposes. Every other screen in the Figma reference has no data behind it yet.
   Current position: build the shell and the primitives, and add a slice when
   its endpoint exists rather than mocking one.
2. **i18n.** The sibling repo runs `next-intl` across five locales. This app
   does not, because nothing has asked for a second locale yet. Adding it later
   is a wrapper in `next.config.ts` and a `messages/` directory, not a rewrite,
   so it is deliberately deferred.
3. **Route groups.** In use. `(app)` carries the shell, `(auth)` renders full
   bleed. They were introduced when auth arrived, which was the first surface
   that must not carry the sidebar. Both keep the same ambient light, so the
   glass reads identically on either side of signing in.

4. **A light theme, from a dark-only palette.** The sibling repo is monochrome
   and dark only. Rather than invent a second palette, light is the same
   greyscale run the other way: the glass tiers invert from white-on-dark to
   dark-on-light and the blur and saturation are untouched, since those are what
   make the material glass rather than a tinted box.

   The cost is that every colour has to be a token. Naming a literal (`text-white`)
   compiles to a fixed value that no theme can move, which is exactly the bug
   the first light render surfaced.
