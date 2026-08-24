# Vivid AI — Frontend

The web client for Vivid AI. Talks to the FastAPI service in
[`../vivid-backend`](../vivid-backend) through its own route handlers.

Architecture, layering and conventions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Coding bar: `.claude/skills/wsws-engineering-standards/SKILL.md`.

## Stack

| Concern    | Choice                                   |
| ---------- | ---------------------------------------- |
| Framework  | Next.js 16 (App Router, React 19)        |
| Language   | TypeScript, strict                       |
| Styling    | Tailwind CSS v4, shared design tokens    |
| Primitives | `@base-ui/react`                         |
| Data       | TanStack Query over a BFF proxy          |
| Validation | Zod, at the proxy boundary               |
| Tests      | Vitest, jsdom, Testing Library           |
| Quality    | ESLint 9 flat config, `eslint-plugin-boundaries`, Prettier |

Package manager is **pnpm**, pinned in `packageManager`. Never npm or yarn.

## Getting started

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

The app runs at http://localhost:3000. Start the backend separately; the home
page shows whether it is reachable.

## Scripts

| Script              | Does                                    |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Dev server                              |
| `pnpm build`        | Production build                        |
| `pnpm start`        | Serve the production build              |
| `pnpm lint`         | ESLint, including the layer boundaries  |
| `pnpm typecheck`    | `tsc --noEmit`                          |
| `pnpm test`         | Vitest, once                            |
| `pnpm test:watch`   | Vitest, watching                        |
| `pnpm format`       | Prettier write, sorts Tailwind classes  |
| `pnpm format:check` | Prettier check                          |

Run `format:check`, `lint`, `typecheck`, `test` and `build` before opening a
pull request. CI runs the same five and will reject what you did not check.

## Where code goes

```
app/          routes and route handlers. Composes features, owns no logic.
features/     vertical slices. A slice never imports a sibling.
components/
  ui/         design system primitives, ignorant of every feature
  layout/     the app shell
hooks/        generic cross-cutting hooks
lib/          pure cross-cutting: transport, format, utils
  server/     server only
config/       app metadata
```

Imports point downward and `pnpm lint` enforces it. Read
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before adding a directory, a
transport, or a shared component.

## Design system

The palette, the fonts and the `ws-*` utilities come from the Worldstreet
frontend unchanged, so a component moved between the repos does not need its
classes rewritten. The material is this app's own: one water glass at five
weights.

```
vd-glass-control   buttons, chips, toolbar items
vd-glass-card      panels, tiles, list rows, the composer
vd-glass-sheet     modals, menus, popovers
vd-glass-well      inputs and quotes
vd-glass-bright    the primary action
vd-sheen           the specular streak, pair with any tier
```

Two rules keep it coherent:

**Never name a colour.** Use `text-fg`, `bg-fg/10`, `border-fg/12`, `ring-page`
and the intent tokens. A literal `text-white` cannot be themed.

**Glass needs light behind it.** `AmbientBackdrop` provides it. Without it every
surface renders as a flat grey rectangle.

`docs/ARCHITECTURE.md` has the full table and the two traps in `globals.css`.

Adding a top-level directory means adding an `@source` line to
`app/globals.css`. Tailwind scans only the listed directories, and a class used
anywhere else is dropped from the stylesheet with no error.

## Adding a screen

1. Create `features/<slice>/` with `components/`, `hooks/`, `lib/`, `index.ts`.
2. Put the upstream call in a route handler under `app/api/`, with a Zod schema
   in `lib/api/schemas/`.
3. Read it through a TanStack Query hook in the slice.
4. Render it from a route in `app/`, composing slices with slots or callbacks.
5. Cover the pure parts with a `.test.ts` beside the file.

## Git

Branch off `main` with a `feat/`, `fix/` or `chore/` prefix. One issue, one
branch, one pull request. Squash merges only. `main` is protected.
