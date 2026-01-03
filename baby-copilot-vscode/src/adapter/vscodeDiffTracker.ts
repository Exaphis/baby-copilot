import * as vscode from "vscode";
import {
  applySnapshot,
  createDiffTrackerState,
  forgetSnapshot,
  rememberSnapshot,
  type DiffEntry,
  type DiffTrackerState,
} from "@baby-copilot/core";

interface VscodeDiffTrackerOptions {
  maxTrajectory?: number;
  mergeWindowMs?: number;
}

export class VscodeDiffTracker {
  private state: DiffTrackerState;

  constructor(options: VscodeDiffTrackerOptions = {}) {
    this.state = createDiffTrackerState({
      maxTrajectory: options.maxTrajectory,
      mergeWindowMs: options.mergeWindowMs,
    });
  }

  get diffTrajectory(): DiffEntry[] {
    return this.state.trajectory;
  }

  handleOpen(doc: vscode.TextDocument): void {
    if (!isTrackableDocument(doc)) {
      return;
    }
    rememberSnapshot(this.state, getDocumentKey(doc), doc.getText());
  }

  handleClose(doc: vscode.TextDocument): void {
    if (!isTrackableDocument(doc)) {
      return;
    }
    forgetSnapshot(this.state, getDocumentKey(doc), getDocumentLabel(doc));
  }

  handleChange(event: vscode.TextDocumentChangeEvent): void {
    if (!isTrackableDocument(event.document)) {
      return;
    }
    const isUserDrivenChange =
      event.document.isDirty ||
      event.document.isUntitled ||
      event.reason === vscode.TextDocumentChangeReason.Undo ||
      event.reason === vscode.TextDocumentChangeReason.Redo;
    applySnapshot(this.state, {
      key: getDocumentKey(event.document),
      label: getDocumentLabel(event.document),
      text: event.document.getText(),
      timestampMs: Date.now(),
      isUserChange: isUserDrivenChange,
    });
  }
}

function isTrackableDocument(doc: vscode.TextDocument): boolean {
  return doc.uri.scheme === "file" || doc.uri.scheme === "untitled";
}

function getDocumentKey(doc: vscode.TextDocument): string {
  return doc.uri.fsPath || doc.uri.toString();
}

function getDocumentLabel(doc: vscode.TextDocument): string {
  return doc.uri.fsPath || doc.uri.toString();
}
