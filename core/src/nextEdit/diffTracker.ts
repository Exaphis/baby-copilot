import { createPatch } from "diff";
import type {
  DiffEntry,
  DiffTrackerState,
  DiffTrackerOptions,
  SnapshotInput,
} from "./types.js";

const defaultOptions: DiffTrackerOptions = {
  maxTrajectory: 20,
  mergeWindowMs: 5000,
};

export function createDiffTrackerState(
  options: Partial<DiffTrackerOptions> = {}
): DiffTrackerState {
  return {
    trajectory: [],
    byPath: new Map(),
    snapshots: new Map(),
    options: { ...defaultOptions, ...options },
  };
}

export function rememberSnapshot(
  state: DiffTrackerState,
  key: string,
  text: string
): void {
  state.snapshots.set(key, text);
}

export function forgetSnapshot(
  state: DiffTrackerState,
  key: string,
  label?: string
): void {
  state.snapshots.delete(key);
  if (label) {
    state.byPath.delete(label);
  }
}

export function applySnapshot(
  state: DiffTrackerState,
  input: SnapshotInput
): void {
  const previous = state.snapshots.get(input.key);
  if (previous === undefined) {
    rememberSnapshot(state, input.key, input.text);
    return;
  }

  if (!input.isUserChange) {
    rememberSnapshot(state, input.key, input.text);
    return;
  }

  if (input.text === previous) {
    return;
  }

  const nowMs = input.timestampMs;
  const lastEntry = state.trajectory[0];
  const existingState = state.byPath.get(input.label);
  if (
    lastEntry &&
    existingState &&
    lastEntry === existingState.entry &&
    nowMs - existingState.lastEditMs <= state.options.mergeWindowMs
  ) {
    const diffText = createPatch(input.label, existingState.base, input.text);
    existingState.entry.diff = diffText;
    existingState.lastEditMs = nowMs;
    rememberSnapshot(state, input.key, input.text);
    return;
  }

  const diffText = createPatch(input.label, previous, input.text);
  const entry: DiffEntry = { path: input.label, diff: diffText };
  state.trajectory.unshift(entry);
  state.byPath.set(input.label, {
    base: previous,
    entry,
    lastEditMs: nowMs,
  });
  if (state.trajectory.length > state.options.maxTrajectory) {
    state.trajectory.length = state.options.maxTrajectory;
  }

  const liveEntries = new Set(state.trajectory);
  for (const [pathKey, entryState] of state.byPath.entries()) {
    if (!liveEntries.has(entryState.entry)) {
      state.byPath.delete(pathKey);
    }
  }

  rememberSnapshot(state, input.key, input.text);
}
