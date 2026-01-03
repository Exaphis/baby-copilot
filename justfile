# Common monorepo tasks for baby-copilot
set shell := ["zsh", "-cu"]

default:
  @just --list

install:
  pnpm install

build:
  pnpm -r --filter ./core --filter ./baby-copilot-vscode build

build-core:
  pnpm -C core build

build-extension:
  pnpm -C baby-copilot-vscode build

build-all:
  pnpm run build:all

build-renderer:
  pnpm --filter @baby-copilot/core build

compile-extension:
  pnpm -C baby-copilot-vscode compile

playground-dev:
  pnpm --filter ./playground/web run dev

playground-build:
  pnpm --filter ./playground/web run build

playground-preview:
  pnpm --filter ./playground/web run preview

watch-renderer:
  pnpm --filter @baby-copilot/code-renderer run watch

watch-extension:
  pnpm --filter ./baby-copilot-vscode run watch

test:
  pnpm -r test

test-core:
  pnpm -C core test

test-extension:
  pnpm --filter ./baby-copilot-vscode test

lint-extension:
  pnpm --filter ./baby-copilot-vscode run lint

# Python optimizer server
install-optimizer:
  cd optimizer && uv sync

run-dspy-server:
  cd optimizer && uv run python server.py
