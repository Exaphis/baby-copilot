export interface DiffEntry {
  path: string;
  diff: string;
}

export interface DiffTrackerOptions {
  maxTrajectory: number;
  mergeWindowMs: number;
}

export interface DiffTrackerEntryState {
  base: string;
  entry: DiffEntry;
  lastEditMs: number;
}

export interface DiffTrackerState {
  trajectory: DiffEntry[];
  byPath: Map<string, DiffTrackerEntryState>;
  snapshots: Map<string, string>;
  options: DiffTrackerOptions;
}

export interface SnapshotInput {
  key: string;
  label: string;
  text: string;
  timestampMs: number;
  isUserChange: boolean;
}

export interface DefinitionSnippet {
  path: string;
  content: string;
}

export interface TextRange {
  startOffset: number;
  endOffset: number;
}

export interface EditorSnapshot {
  path: string;
  text: string;
  editableRange: TextRange;
}

export interface PromptParts {
  systemPrompt: string;
  userPrompt: string;
  contextBlock: string;
  diffTrace: string;
}
