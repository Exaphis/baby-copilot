# Next Edit Suggestions PRD

## Overview
- Build a native-feeling "next edit" suggestion experience that surfaces inline predictive edits across multiple editors starting with VS Code.
- Separate interface and orchestration layers so model providers can evolve independently from the UX and editor adapters.
- Deliver consistent core behaviors (fetch, preview, accept, cancel, feedback) while allowing each editor to render suggestions using native primitives.

## Problem Statement
Developers lack a seamless way to preview and apply multi-line model-driven edits inline. Existing tools (ghost text, command-based refactors) feel disconnected, vary across editors, and make it hard to trust or audit suggestions.

## Goals & Objectives
- Provide inline edit previews that match each editor’s native styling and interaction patterns.
- Support fast cancellation and throttling to avoid wasted compute when users keep typing.
- Capture user feedback (accept/reject/cancel) to inform ranking, telemetry, and iteration.
- Enable deterministic reproduction of suggestion flows via context dumps and a playground.

## Non-Goals
- Shipping or tuning production-grade models (handled later).
- Supporting partial acceptance of diffs in the first release.
- Building collaborative or shared suggestion workflows.

## Target Users
- Individual developers using VS Code initially, expanding to PyCharm, JupyterLab, Vim, and Emacs.
- Internal engineers designing and testing the UX through playground and replay tooling.

## Editorial Scope
- VS Code MVP with inline decorations + diff panel fallback.
- Early adapters for PyCharm and JupyterLab leveraging HTML/SVG presenters.
- Planning stubs for Vim/Emacs adapters using ANSI/overlay presenters.

## User Experience Principles
- Feels native: colors, fonts, layouts align with host editor conventions.
- Low friction: suggestion fetch triggered on pause or shortcut, single-key accept, instant cancel.
- Transparent: motivations and risks surfaced through tooltips and warnings; diff previews easy to inspect.

## Key Use Cases
1. Developer pauses typing; ghost text shows insertion suggestion and can be accepted with Tab.
2. Model proposes deletions; overlay highlights text in red with accept/cancel.
3. Complex edit triggers diff panel; user inspects rationale before applying.
4. Developer rejects suggestion; feedback logged, in-flight jobs cancelled.
5. Engineer captures snapshot, replays in playground to tweak presentation policy.

## Functional Requirements
- Maintain live context (document text, cursor history, LSP signals) per workspace session.
- Emit structural `DiffShape` and derive `PresentationHints` for each suggestion.
- Provide cancellation handle for every in-flight request, triggered on context changes or explicit user action.
- Log outcomes (`accepted`, `rejected`, `expired`) with metadata for analysis.
- Offer context dump and replay capability for debugging and UX review.
- Support multiple presenters (SVG, HTML, ANSI) selectable per adapter.

## Non-Functional Requirements
- Latency: render inline preview within 150 ms after model response for the MVP.
- Resource efficiency: cap concurrent requests; cancellation must abort backend calls.
- Extensibility: add new editors or presenters without modifying the engine core.
- Privacy-aware: avoid storing raw code unless user opts in to telemetry/debugging.

## Success Metrics
- Time-to-preview (request issued → preview displayed) ≤ 500 ms p95 (model latency excluded).
- Cancellation coverage: ≥ 95 % of outdated requests aborted before backend finish.
- Acceptance telemetry coverage: ≥ 90 % of suggestions produce outcome events.
- Developer satisfaction: ≥ 80 % positive rating in internal dogfooding.

## Dependencies
- Reliable diff computation library accessible from TypeScript.
- Editor APIs for decorations/inlays/webviews per host.
- Optional: LSP bindings for diagnostics/symbol data.

## Risks & Mitigations
- **Process overhead for stdio adapters** → keep hybrid approach (in-process for Node-capable hosts, stdio fallback).
- **Theme mismatch** → build theme token extraction + preview tooling to validate.
- **Telemetry/privacy concerns** → provide opt-in toggles and hashed context identifiers.
- **Complex policy tuning** → invest in playground, golden fixtures, and inspector overlays.

## Open Questions
- Required telemetry retention policy and storage backend.
- Packaging strategy for JetBrains/Vim/Emacs ecosystems.
- Minimum viable browser playground hosting (local only vs. hosted).

## Timeline (Tentative)
1. Engine + diff refactor (4 weeks).
2. VS Code MVP with cancellation + feedback (4 weeks).
3. Playground + replay tooling (2 weeks).
4. Terminal adapters (Neovim/Emacs) spike (3 weeks).

