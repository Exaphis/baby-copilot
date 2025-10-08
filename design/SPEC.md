# Next Edit Suggestions Technical Specification

## 1. Scope & Objectives
- Provide a reusable suggestion engine that editors can embed in-process (Node-capable hosts) or via stdio for terminal clients.
- Maintain rich context (document state, interactions, LSP signals) to feed model requests.
- Generate structural diffs (`DiffShape`) and policy-driven `PresentationHints` that adapters render with native UI primitives.
- Support fast cancellation, feedback logging, context dumps, and replay tooling to accelerate development.

## 2. High-Level Architecture
```
Editor Adapter ─┐
                │ publish events / request suggestions
Suggestion Engine Core
  ├─ Context Stores (documents, interactions, LSP)
  ├─ Suggestion Pipeline (context snapshot → model adapter → diff processor)
  ├─ Presentation Policy (diff shape → presentation hints)
  ├─ Feedback Manager (outcomes, telemetry sinks)
  └─ Transport Layer (in-process API or stdio RPC)
                │ deliver suggestion results + hints
Presentation Layer (per editor)
  ├─ Presenter selector (SVG / ANSI / native)
  └─ Native rendering primitives (decorations, overlays, buffers)
```

## 3. Core Modules
### 3.1 Context Event Hub
- Receives `ContextEvent` objects from adapters (document updates, cursor moves, mouse activity, LSP notifications).
- Debounces bursts (e.g., keypresses) and updates sub-stores.
- Emits `ContextReady` when a snapshot is stable; triggers prefetchers.

```ts
interface ContextEvent {
  type: 'document/update' | 'interaction/cursor' | 'interaction/mouse' |
        'lsp/diagnostic' | 'lsp/semanticTokens' | 'git/status';
  uri: string;
  payload: unknown;
  timestamp: number;
}
```

### 3.2 Context Stores
- **DocumentStore**: piece-table rope storing full text, version, language id, edit ring buffer (last N changes).
- **InteractionStore**: cursor position, selection, intent trace (recent moves + durations).
- **LspStore**: diagnostics, symbol summaries, semantic tokens, capability flags.
- `getSnapshot(uri)` returns immutable `ContextSnapshot` consumed by suggestion pipeline.

### 3.3 Suggestion Pipeline
1. Consume latest snapshot + metadata (suggestion trigger, user settings).
2. Build model request via `PromptFormatter` (pluggable model adapters).
3. Dispatch request, returning `SuggestionHandle` with `promise` + `cancel()`.
4. On response, compute diff using `DiffEngine` and derive `DiffShape`.
5. Run `PresentationPolicy` to produce `PresentationHints`.
6. Cache result in `SuggestionRegistry` until outcome logged or invalidated.

```ts
interface SuggestionHandle {
  id: SuggestionId;
  promise: Promise<SuggestionResult>;
  cancel(reason?: string): void;
  signal: AbortSignal;
}

interface SuggestionResult {
  id: SuggestionId;
  snapshot: ContextSnapshot;
  edits: TextEdit[]; // canonical operations
  diff: DiffShape;
  presentation: PresentationHints;
  metadata: SuggestionMetadata;
}
```

### 3.4 Diff Engine & Model
- Wrap composable diff implementation (e.g., Myers) producing spans with precise ranges and operations (`insert`, `delete`, `replace`).
- Normalize whitespace, handle multi-hunk edits, and attach context lines.
- Provide API to compute diff incrementally to support repeated requests on same baseline.

```ts
interface DiffShape {
  documentVersion: number;
  hunks: DiffHunk[];
}

interface DiffHunk {
  id: string;
  range: { start: Position; end: Position; };
  operations: DiffSpan[];
}

interface DiffSpan {
  kind: 'insert' | 'delete' | 'replace';
  text: string;
  originalText?: string;
  inlineMetadata?: Record<string, string>;
}
```

### 3.5 Presentation Policy
- Accepts `DiffShape`, cursor info, and engine settings; returns per-span hints guiding rendering.
- Heuristics: pure insert ≤3 lines → `ghost`; pure delete ≤3 lines → `overlay-removal`; mixed edits or larger changes → `diff-panel`.
- Configuration via `PresentationPolicyConfig` (thresholds, fallback modes) allowing editor overrides.

```ts
type PresentationMode = 'ghost' | 'overlay-removal' | 'diff-panel';

interface PresentationHints {
  mode: PresentationMode;
  hunks: Array<{
    hunkId: string;
    spans: Array<{
      spanId: string;
      mode: PresentationMode;
      priority: number;
    }>;
  }>;
  rationale?: string;
}
```

### 3.6 Presentation Providers
- `PresentationProvider` interface exposes `prepare(diff, hints, theme, metrics)` and returns a `RenderArtifact` describing the assets required by the adapter. Artifacts include payload, bounding boxes, interactive affordances (apply/cancel hotspots), and optional accessibility metadata. Editors control the container chrome (panel title bars, buttons); providers only supply the content payload and metadata.

```ts
interface RenderArtifact {
  kind: 'svg' | 'ansi' | string; // custom kinds allowed
  payload: string | Uint8Array;
  bounds: Array<{ spanId: string; rect: DOMRectLike }>;
  interactions?: Array<{ action: 'accept' | 'reject' | 'explain'; targetId: string }>;
  themeFingerprint: string;
}
```

- `svgPresenter` is an optional shared renderer for `diff-panel` hints. It layers on `core/code-renderer`, consumes theme tokens + font metrics, and outputs SVG markup plus layout metadata. Host editors may embed the SVG directly, wrap it in native chrome, or replace it with their own panel rendering while still consuming the shared diff structure. The presenter performs caching keyed by `(diffShape, themeId, fontHash)` to avoid recomputation and exposes an event channel so adapters can wire hover/tooltips to specific spans.
- `ansiPresenter` provides terminal-friendly output by translating `diffShape` and hints into sequences of `{ text, styleToken }`. Vim/Emacs adapters map tokens to highlight groups or overlays, enabling red deletion highlights and ghost insert text without graphics support.
- Adapters may extend the interface with custom providers (e.g., platform-native diff widgets) so long as they advertise dependencies (required fonts, minimum viewport) and honor `PresentationHints` semantics. Custom providers can reuse the shared diff shape while returning `kind` identifiers meaningful to the host.
- For inline modes (`ghost`, `overlay-removal`) the adapter usually renders directly via native primitives. Providers still expose helper utilities (e.g., measure text widths) so hosts can mix overlay decorations with SVG panels in a consistent style.

### 3.7 Feedback Manager
- Registers outcomes via `registerOutcome(id, outcome, metadata)` and optional `registerEditApplied`.
- Persists in-memory queue; pluggable `FeedbackSink` writes to local file, IPC, or remote endpoint.
- Stores anonymized summary (hash of suggestion, counts) for ranking tuning.

### 3.8 Cancellation Manager
- Tracks active handles in `Map<SuggestionId, AbortController>`.
- Auto-cancels when context version increments, user types, or explicit cancel command invoked.
- Enforces concurrency limit; rejects new requests once limit reached until oldest completes or cancels.

## 4. Transport & Embedding
### 4.1 In-Process API (Node/Electron)
- Editors import `createEngine(config)` returning `SuggestionEngine` interface.
- Exposes event emitter for results and state transitions.

### 4.2 stdio RPC (Terminal Editors)
- Ship CLI `@baby-copilot/edit-engine run --stdio`.
- JSON-RPC methods: `requestSuggestion`, `cancelSuggestion`, `registerOutcome`, `getSnapshot`, `dumpSnapshot`.
- All payloads conform to shared JSON schema generated from TypeScript types.

### 4.3 Web Environments
- Provide WASM bundle with same API surface (for JupyterLab in-browser). Rate-limit to avoid large memory usage. Cancellation uses `AbortController` tied to fetch.

## 5. Editor Adapter Responsibilities
- Translate editor events to `ContextEvent`s (text changes, cursor moves, diagnostics).
- Choose presenter based on hints and host capabilities.
- Manage lifecycle of inline UI (decorations, overlays, panels) according to `PresentationHints`.
- Wire keyboard shortcuts (accept, cancel, open diff panel) to engine commands.
- Expose developer commands: `Dump Suggestion Context`, `Toggle Suggestion Playground`.

### 5.1 VS Code MVP
- Inline `ghost` via `InlineCompletionItemProvider` for pure inserts.
- `overlay-removal` maps to `TextEditorDecorationType` with themed red background.
- `diff-panel` mode triggers a custom editor surface that the extension owns; it may embed the shared SVG artifact or render directly from `DiffShape` using VS Code’s native diff editor for chrome.
- Cancellation on `onDidChangeTextDocument` and `onDidChangeCursorPosition` events.

### 5.2 PyCharm
- Build Kotlin-side adapter bridging to Node engine via local socket (still in-process using Node runtime).
- Render overlays with `InlayModel` and `EditorCustomElementRenderer`; diff panel implemented as JetBrains tool window or popup that can embed the shared SVG artifact or repaint using Swing components fed by `DiffShape`.

### 5.3 JupyterLab
- Hook into CodeMirror 6 decorations; convert hints into widgets/overlays respecting Lumino themes.
- Provide web extension packaging that embeds engine via WASM.
- Diff panel rendered as Lumino widget owned by the extension; it can host the SVG artifact in an `<object>`/`<embed>` element or redraw using Canvas/WebGL from the same diff data.

### 5.4 Vim/Neovim
- Lua adapter spawns stdio engine, uses extmarks + virtual text for `ghost` and `overlay` modes.
- `diff-panel` opens temporary split buffer with ANSI presenter output.

### 5.5 Emacs
- Elisp adapter using `start-process`; overlays + faces for inline hints; `diff-panel` uses transient buffer with ANSI presenter.

## 6. Data Formats
### 6.1 Context Snapshot
```ts
interface ContextSnapshot {
  document: {
    uri: string;
    version: number;
    languageId: string;
    text: string; // optional truncated payload in terminal mode
    recentEdits: EditFragment[];
  };
  interactions: {
    cursor: Position;
    selection?: Range;
    intentTrace: InteractionSummary[];
  };
  semantics?: {
    diagnostics: Diagnostic[];
    symbols?: SymbolSummary[];
  };
  settings: EngineSettings;
}
```

### 6.2 Outcome Event
```ts
interface SuggestionOutcomeEvent {
  id: SuggestionId;
  outcome: 'accepted' | 'rejected' | 'expired';
  reason?: 'canceled' | 'typedThrough' | 'manualReject';
  issuedAt: number;
  resolvedAt: number;
  metadata?: Record<string, unknown>;
}
```

## 7. Configuration
- `EngineSettings`: concurrency limits, debounce windows, policy thresholds (ghost lines, overlay columns), telemetry opt-in, snapshot truncation size.
- Per-editor config surfaces user-facing settings (enable feature, trigger mode, keybindings).
- Provide engine-level feature flags for staged rollout (e.g., new presenters, replay hooks).

## 8. Error Handling & Resilience
- Graceful degradation: if presenter unavailable, fallback to plain inline message.
- Timeouts: auto-expire suggestions exceeding configured latency; log outcome and notify adapter to hide preview.
- LSP absence: engine marks features as unavailable, policy degrades to minimal hints.
- Telemetry gating: if user declines, feedback sink swaps to no-op.

## 9. Development Tooling
- **Playground** (`demo-site/playground`): paste current/suggested text, adjust policy thresholds, view presenters side-by-side.
- **Context Dump & Replay**: `dumpSnapshot` command writes JSON; `pnpm run replay --file dump.json` renders identical UI in playground.
- **Policy Inspector**: optional overlay showing hint decisions per span (dev flag).
- **Model Stub Server**: configurable mock returning deterministic edits for automated tests.
- **Golden Fixtures**: repository of representative contexts; CI compares new presenter outputs via snapshot tests.
- **Telemetry Dashboard**: CLI/GUI summarizing latency, cancellation, acceptance.

## 10. Testing Strategy
- Unit tests: context stores, diff engine, presentation policy heuristics.
- Contract tests: ensure JSON schema stability between engine core and adapters.
- Integration tests: VS Code extension host tests simulating typing + acceptance; Neovim RPC tests for cancellation.
- Visual regression: capture SVG and ANSI outputs for top scenarios; compare hashes.
- Performance tests: stress cancellation by simulating rapid typing; ensure concurrency limits hold.

## 11. Security & Privacy
- Keep context snapshots in-memory by default; dumps gated behind explicit command with warning.
- Support hashed identifiers (SHA-256) for telemetry linking without raw code.
- Store API keys or credentials in editor-specific secure storage (VS Code secrets API, JetBrains password safe); engine reads via callback.

## 12. Deployment & Versioning
- Package engine as `@baby-copilot/edit-engine` npm module; expose CLI entrypoint for stdio mode.
- Use semantic versioning; adapters pin to compatible engine major.
- Provide migration guide when diff schema or presentation hints change.

## 13. Open Items
- Determine storage backend for persistent telemetry (local vs. remote).
- Finalize WASM feasibility for web environments (memory footprint, bundler constraints).
- Decide on log retention + privacy defaults for context dumps.
