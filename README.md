# baby-copilot

A tiny version of GitHub Copilot.

## Monorepo Layout

- `core/code-renderer`: Shared code highlighting -> SVG renderer (uses `shiki`).
- `baby-copilot-vscode`: VS Code extension that consumes the renderer package.
- `demo-site`: Express-based demo site showing multiple diff panes with live reload.

## Prerequisites

- Node.js and pnpm installed
  - Install pnpm: `npm i -g pnpm`

## Install

Run from the repository root:

```
pnpm install
```

This links the workspace and builds the `@baby-copilot/code-renderer` package via its `prepare` script.

## Build

Build the renderer package and compile the VS Code extension:

```
pnpm --filter @baby-copilot/code-renderer build
pnpm --filter ./baby-copilot-vscode run compile
```

Alternatively, build all packages that define a `build` script:

```
pnpm -r build
```

## Demo Site

- Quick start:
  - `pnpm install`
  - `pnpm run demo`
  - Open `http://localhost:3000`

- What it does:
  - Serves multiple diff panes (one per line) rendered by `@baby-copilot/code-renderer`.
  - Live-reloads previews when you edit files.

- Edit these files to see updates:
  - `demo-site/demos/greet/before.ts` and `demo-site/demos/greet/after.ts`
  - `demo-site/demos/algorithm/before.ts` and `demo-site/demos/algorithm/after.ts`
  - `demo-site/demos/config/before.ts` and `demo-site/demos/config/after.ts`

- Useful scripts:
  - From repo root: `pnpm run demo` (builds renderer then builds/starts the demo)
  - Inside demo-site: `pnpm run serve` (build then start), `pnpm run dev` (restarts server on build output changes)

## Run the VS Code Extension

1. Open the repo in VS Code.
2. Select the `baby-copilot-vscode` launch config and press F5 to start an Extension Development Host.
3. The extension activates on startup and will render suggestions inline when available.

## Troubleshooting

- Error: "Cannot find package '@baby-copilot/code-renderer' imported from .../baby-copilot-vscode/out/extension.js"
  - Ensure you ran `pnpm install` from the repo root (not inside `baby-copilot-vscode`).
  - Build the renderer and compile the extension:
    - `pnpm --filter @baby-copilot/code-renderer build`
    - `pnpm --filter ./baby-copilot-vscode run compile`
  - Reload the VS Code window.

- TypeScript cannot find `@baby-copilot/code-renderer` types in the extension
  - The extension `tsconfig.json` includes a `paths` mapping and project reference. If the editor still complains, run "TypeScript: Restart TS server" in VS Code.

## Renderer Package API (brief)

- `CodeRenderer.getInstance()` – singleton accessor
- `setTheme(themeName: string)` – set Shiki theme (e.g., `dark-plus`)
- `getDataUri(code, language, options)` – highlight code to SVG data URI
- `computeDiff(left, right)` – returns `{ content, diffRanges }` for rendering diffs
- `getDiffDataUri(left, right, language, options)` – render diff directly to SVG data URI

## Notes / Ideas

- [ ] Ghost text completion
- [ ] Edit data collection
- [ ] Next edit suggestion

Tab with VSCodeVim should add `baby-copilot.hasSuggestion` to the `when` clause of the `vim_tab` keybinding.

Next edit suggestion reverse engineering: https://github.com/Xuyuanp/nes.nvim

Zed's subtle mode: https://zed.dev/blog/out-of-your-face-ai
