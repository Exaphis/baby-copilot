# baby-copilot

A tiny version of GitHub Copilot.

## Monorepo Layout

- `core`: Shared utilities (diff tracking, prompt building, etc.).
- `baby-copilot-vscode`: VS Code extension.
- `playground/web`: Vite playground for UI experiments.

## Prerequisites

- Node.js and pnpm installed
  - Install pnpm: `npm i -g pnpm`

## Install

Run from the repository root:

```
pnpm install
```

This links the workspace and builds the `@baby-copilot/core` package via its `prepare` script.

## Build

Build the core package and compile the VS Code extension:

```
pnpm --filter @baby-copilot/core build
pnpm --filter ./baby-copilot-vscode run compile
```

Alternatively, build all packages that define a `build` script:

```
pnpm -r build
```

## Justfile shortcuts

If you use `just`, the repo includes common recipes:

- `just` or `just --list` – show available tasks
- `just install` – `pnpm install`
- `just build` / `just build-all` – scoped build vs `pnpm -r build`
- `just build-renderer` – build `@baby-copilot/core`
- `just compile-extension` – compile the VS Code extension
- `just playground-dev` / `playground-build` / `playground-preview` – Vite app for playground/web
- `just watch-renderer`, `just watch-extension` – watch modes
- `just test`, `just test-core`, `just test-extension` – test suites (core = `@baby-copilot/core`)

## Playground

- Quick start:
  - `pnpm install`
  - `just playground-dev` (or `pnpm --filter ./playground/web run dev`)
  - Open the printed Vite dev server URL

- What it does:
  - Currently a simple UI sandbox; diff rendering is disabled.

## Run the VS Code Extension

1. Open the repo in VS Code.
2. Select the `baby-copilot-vscode` launch config and press F5 to start an Extension Development Host.
3. The extension activates on startup and will render suggestions inline when available.

## Troubleshooting

- Error: "Cannot find package '@baby-copilot/core' imported from .../baby-copilot-vscode/out/extension.js"
  - Ensure you ran `pnpm install` from the repo root (not inside `baby-copilot-vscode`).
  - Build core and compile the extension:
    - `pnpm --filter @baby-copilot/core build`
    - `pnpm --filter ./baby-copilot-vscode run compile`
  - Reload the VS Code window.

- TypeScript cannot find `@baby-copilot/core` types in the extension
  - The extension `tsconfig.json` includes a `paths` mapping and project reference. If the editor still complains, run "TypeScript: Restart TS server" in VS Code.

## Notes / Ideas

- [ ] Ghost text completion
- [ ] Edit data collection
- [ ] Next edit suggestion

Tab with VSCodeVim should add `baby-copilot.hasSuggestion` to the `when` clause of the `vim_tab` keybinding.

Next edit suggestion reverse engineering: https://github.com/Xuyuanp/nes.nvim

Zed's subtle mode: https://zed.dev/blog/out-of-your-face-ai
