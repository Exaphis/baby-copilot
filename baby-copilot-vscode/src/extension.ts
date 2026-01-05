/// <reference path="./vscode.proposed.inlineCompletionsAdditions.d.ts" />
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as nesUtils from "./nesUtils.js";
import { randomUUID } from "crypto";
import { VscodeDiffTracker } from "./adapter/vscodeDiffTracker.js";

export async function activate(context: vscode.ExtensionContext) {
  // trigger inline edit on baby-copilot.triggerSuggestion
  let shouldProvideInlineEdit = false;
  let autoTriggerEnabled = false;
  let latencyProbeDone = false;
  let latencyProbeInFlight = false;
  let inFlightRequest = false;
  let autoTriggerTimer: NodeJS.Timeout | null = null;
  let lastChangeAt: number | null = null;
  const recentIntervals: number[] = [];
  const recentLatencies: number[] = [];

  const diffTracker = new VscodeDiffTracker({
    maxTrajectory: 20,
    mergeWindowMs: 5000,
  });

  const MIN_DEBOUNCE_MS = 60;
  const MAX_DEBOUNCE_MS = 1000;
  const MAX_INTERVAL_SAMPLES = 6;
  const MAX_LATENCY_SAMPLES = 5;
  const LATENCY_PROBE_COUNT = 3;
  const LATENCY_PROBE_TIMEOUT_MS = 2000;
  const LATENCY_ENABLE_THRESHOLD_MS = 750;

  function pushSample(list: number[], value: number, max: number) {
    list.push(value);
    if (list.length > max) {
      list.shift();
    }
  }

  function average(values: number[]): number | null {
    if (values.length === 0) {
      return null;
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function computeDynamicDebounceMs(lastChar: string | null) {
    const avgInterval = average(recentIntervals);
    const avgLatency = average(recentLatencies);
    const baseInterval = avgInterval ?? 120;
    let delay = baseInterval * 1.4;

    if (avgInterval !== null && avgInterval < 120) {
      delay += 140;
    }

    if (lastChar && /[A-Za-z0-9_]/.test(lastChar)) {
      delay += 80;
    }

    if (lastChar && lastChar === ".") {
      delay = Math.min(delay, 80);
    } else if (lastChar && /\s/.test(lastChar)) {
      delay = Math.min(delay, 110);
    }

    if (avgLatency !== null) {
      delay -= Math.min(avgLatency * 0.3, 180);
    }

    return clamp(Math.round(delay), MIN_DEBOUNCE_MS, MAX_DEBOUNCE_MS);
  }

  async function runLatencyProbe() {
    if (latencyProbeDone || latencyProbeInFlight) {
      return;
    }
    latencyProbeInFlight = true;
    const samples: number[] = [];

    for (let i = 0; i < LATENCY_PROBE_COUNT; i += 1) {
      const tokenSource = new vscode.CancellationTokenSource();
      const timeout = setTimeout(
        () => tokenSource.cancel(),
        LATENCY_PROBE_TIMEOUT_MS
      );
      try {
        const startTime = Date.now();
        const ok = await nesUtils.requestProbe(tokenSource.token);
        if (ok) {
          const elapsed = Date.now() - startTime;
          samples.push(elapsed);
        }
      } catch (error) {
        console.error("Latency probe failed", error);
      } finally {
        clearTimeout(timeout);
      }
    }

    const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
    if (avg !== null && avg < LATENCY_ENABLE_THRESHOLD_MS) {
      autoTriggerEnabled = true;
    }
    latencyProbeDone = true;
    latencyProbeInFlight = false;
    const probeLabel =
      avg === null ? "failed" : `${Math.round(avg)}ms avg`;
    console.log(
      `baby-copilot: latency probe ${probeLabel} -> auto=${autoTriggerEnabled}`
    );
    vscode.window.showInformationMessage(
      `baby-copilot: auto-trigger ${autoTriggerEnabled ? "enabled" : "disabled"} (${probeLabel})`
    );
  }

  function scheduleAutoTrigger(lastChar: string | null) {
    if (!autoTriggerEnabled) {
      return;
    }
    if (autoTriggerTimer) {
      clearTimeout(autoTriggerTimer);
    }
    const delay = computeDynamicDebounceMs(lastChar);
    autoTriggerTimer = setTimeout(async () => {
      autoTriggerTimer = null;
      if (inFlightRequest) {
        autoTriggerTimer = setTimeout(() => {
          scheduleAutoTrigger(null);
        }, 80);
        return;
      }
      shouldProvideInlineEdit = true;
      await vscode.commands.executeCommand(
        "editor.action.inlineSuggest.trigger"
      );
    }, delay);
  }

  const inlineProvider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, context, token) {
      if (!shouldProvideInlineEdit) {
        return [];
      }
      shouldProvideInlineEdit = false;
      inFlightRequest = true;

      const rangeForSnippet = document.validateRange(
        new vscode.Range(
          Math.max(position.line - 10, 0),
          0,
          position.line + 10,
          0
        )
      );
      let edit: nesUtils.NesSuggestion | null = null;
      try {
        const startTime = Date.now();
        edit = await nesUtils.requestEdit(
          {
            doc: document,
            diffTrajectory: diffTracker.diffTrajectory,
            cursor: position,
            editableRange: rangeForSnippet,
          },
          token
        );
        const elapsed = Date.now() - startTime;
        if (edit !== null) {
          pushSample(recentLatencies, elapsed, MAX_LATENCY_SAMPLES);
        }
      } finally {
        inFlightRequest = false;
      }

      if (edit === null) {
        return [];
      }

      const item: vscode.InlineCompletionItem = {
        // Show a diff-style inline edit that deletes the current line's content.
        insertText: edit.content,
        range: rangeForSnippet,
        isInlineEdit: true,
        showInlineEditMenu: true,
        correlationId: randomUUID(),
        completeBracketPairs: true,
      };

      const list = new vscode.InlineCompletionList([item]);
      list.enableForwardStability = true;

      return list;
    },
    handleEndOfLifetime(completionItem, reason) {
      let reasonLabel = "unknown";
      switch (reason.kind) {
        case vscode.InlineCompletionEndOfLifeReasonKind.Accepted:
          reasonLabel = "accepted";
          break;
        case vscode.InlineCompletionEndOfLifeReasonKind.Rejected:
          reasonLabel = "rejected";
          break;
        case vscode.InlineCompletionEndOfLifeReasonKind.Ignored:
          reasonLabel = "ignored";
          break;
      }

      const message = `Inline edit ${reasonLabel} (${
        completionItem.correlationId ?? "no id"
      })`;
      console.log(message, reason);
      vscode.window.setStatusBarMessage(message, 3000);
    },
  };

  const inlineCompletionProvider =
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      inlineProvider,
      {
        displayName: "Hello Inline Completion (sample)",
      }
    );

  vscode.workspace.textDocuments.forEach((doc) => {
    diffTracker.handleOpen(doc);
  });

  const openDocumentListener = vscode.workspace.onDidOpenTextDocument((doc) => {
    diffTracker.handleOpen(doc);
  });

  const closeDocumentListener = vscode.workspace.onDidCloseTextDocument(
    (doc) => {
      diffTracker.handleClose(doc);
    }
  );

  const changeDocumentListener = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      diffTracker.handleChange(event);
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor || activeEditor.document !== event.document) {
        return;
      }
      if (!latencyProbeDone) {
        runLatencyProbe();
      }
      const change = event.contentChanges[event.contentChanges.length - 1];
      if (!change) {
        return;
      }
      const now = Date.now();
      if (lastChangeAt !== null) {
        pushSample(recentIntervals, now - lastChangeAt, MAX_INTERVAL_SAMPLES);
      }
      lastChangeAt = now;
      const lastChar =
        change.text.length > 0 ? change.text[change.text.length - 1] : null;
      scheduleAutoTrigger(lastChar);
    }
  );

  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) {
        runLatencyProbe();
      }
    }
  );

  const disposable = vscode.commands.registerCommand(
    "baby-copilot.triggerSuggestion",
    async () => {
      shouldProvideInlineEdit = true;
      vscode.window.showInformationMessage(
        "baby-copilot: Triggered suggestion"
      );
      await vscode.commands.executeCommand(
        "editor.action.inlineSuggest.trigger"
      );
    }
  );

  const viewLogsCommand = vscode.commands.registerCommand(
    "baby-copilot.viewLogs",
    () => {
      const storagePath = context.globalStorageUri.fsPath;
      const logFilePath = path.join(storagePath, "events.log");
      if (fs.existsSync(logFilePath)) {
        const logUri = vscode.Uri.file(logFilePath);
        vscode.window.showTextDocument(logUri);
      } else {
        vscode.window.showInformationMessage("No logs found.");
      }
    }
  );

  context.subscriptions.push(
    disposable,
    viewLogsCommand,
    inlineCompletionProvider,
    openDocumentListener,
    closeDocumentListener,
    changeDocumentListener,
    activeEditorListener
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
