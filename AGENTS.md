## Project Guidelines (Summary)

- Repo uses pnpm workspaces; run commands from repo root unless noted.
- `baby-copilot-vscode` is CommonJS output (no `"type": "module"`). Use `tsc -b` and expect `out/` outputs.
- Core package exports next-edit utilities; renderer/dmp diff code removed.
- VS Code extension tests run via `vscode-test` with config in `baby-copilot-vscode/.vscode-test.mjs`.
- Extension tests should compile and lint first (`pretest`), and use compiled test files under `baby-copilot-vscode/out/test/**`.
- When updating tests in `core/test`, keep them CommonJS to avoid module-type warnings.

## Commands (Common)

- Install: `pnpm install`
- Core tests: `pnpm -C core test`
- Extension tests: `pnpm -C baby-copilot-vscode test`
- Extension compile: `pnpm -C baby-copilot-vscode compile`
