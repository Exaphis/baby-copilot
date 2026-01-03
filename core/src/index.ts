export {
  createDiffTrackerState,
  applySnapshot,
  rememberSnapshot,
  forgetSnapshot,
  buildPrompt,
  formatDefinitionSnippets,
} from "./nextEdit/index.js";
export type {
  DiffEntry,
  DiffTrackerOptions,
  DiffTrackerEntryState,
  DiffTrackerState,
  SnapshotInput,
  DefinitionSnippet,
  TextRange,
  EditorSnapshot,
  PromptParts,
} from "./nextEdit/index.js";
