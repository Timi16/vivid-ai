<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Engineering standards

Read `.claude/skills/wsws-engineering-standards/SKILL.md` before writing or reviewing any code, comment, or document in this repository. It defines the architecture rules, correctness bar, naming and comment style, and the git workflow. It is not optional.

These are the same standards the Worldstreet frontend runs on. The two apps sit
under one company and share their layering, transport shape, design tokens and
review bar, so a change that would be rejected there is rejected here.
