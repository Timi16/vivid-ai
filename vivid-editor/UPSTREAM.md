# Upstream

This is a fork of [microsoft/vscode](https://github.com/microsoft/vscode),
vendored into this repository. The clone's `.git` was removed, so upstream
history is not present here.

**Forked at** `ea7ede57fb2d943c86c31520c28ab06f0c547cf1` (2026-08-26).

To pull upstream changes later, add it as a remote from the repository root
and merge with unrelated histories allowed:

```bash
git remote add vscode https://github.com/microsoft/vscode.git
git fetch vscode
git merge vscode/main --allow-unrelated-histories   # expect conflicts in the branded files
```

## What is changed from upstream

Branding only. No source changes.

| File | Change |
| --- | --- |
| `product.json` | Name, ids, data folders, URL protocol, bundle identifier, Windows identity (fresh GUIDs), Open VSX gallery |
| `resources/darwin/code.icns` | Vivid mark |
| `resources/linux/code.png` | Vivid mark |
| `resources/win32/code.ico`, `code_70x70.png`, `code_150x150.png` | Vivid mark |
| `resources/win32/VisualElementsManifest.xml` | Tile name and background |
| `resources/server/*` | Icons, favicon, PWA manifest name |

The icons are generated, not hand-drawn — see `scripts/vivid-icons.py`, which
renders the mark from `vivid-frontend/app/icon.svg` at every size the three
platforms need.

## Marketplace

`extensionsGallery` points at [Open VSX](https://open-vsx.org). Microsoft's
marketplace terms do not permit non-VS Code clients and are enforced, so this
is not a preference — it is the only gallery a fork may legally use. Some
extensions users expect (C/C++, Pylance, Remote-SSH) are not published there.

## Building

Requires **Node 24.18.0** (see `.nvmrc`) and a toolchain with C++20 `libc++`.

> **macOS 13 with Command Line Tools 14 cannot build this.** Electron 42's
> headers include `<source_location>`, which Apple's libc++ only ships from
> Xcode 15 onward. Native modules (`native-keymap`, `@parcel/watcher`) fail
> with `fatal error: 'source_location' file not found`. Use macOS 14+ with
> Xcode 15 or newer.

```bash
nvm use              # or fnm use
npm install
npm run watch        # leave running
./scripts/code.sh    # in another terminal
```
