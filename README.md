# baby-copilot

A tiny version of GitHub Copilot.

## Monorepo Layout

- `packages/code-renderer`: Shared code highlighting -> SVG renderer (uses `shiki`).
- `baby-copilot-vscode`: VS Code extension that consumes the renderer package.

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

## Notes / Ideas

- [ ] Ghost text completion
- [ ] Edit data collection
- [ ] Next edit suggestion

Tab with VSCodeVim should add `baby-copilot.hasSuggestion` to the `when` clause of the `vim_tab` keybinding.

Next edit suggestion reverse engineering: https://github.com/Xuyuanp/nes.nvim

Zed's subtle mode: https://zed.dev/blog/out-of-your-face-ai
