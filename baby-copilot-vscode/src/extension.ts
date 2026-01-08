/// <reference path="./vscode.proposed.inlineCompletionsAdditions.d.ts" />
import * as vscode from "vscode";
import * as fs from "fs";
import * as nesUtils from "./nesUtils.js";
import { randomUUID } from "crypto";
import { VscodeDiffTracker } from "./adapter/vscodeDiffTracker.js";
import {
  activateDataCollection,
  getTelemetryLogPath,
  logTelemetry,
} from "./dataCollection.js";

export async function activate(context: vscode.ExtensionContext) {
  // trigger inline edit on baby-copilot.triggerSuggestion
  let shouldProvideInlineEdit = false;
  let autoTriggerEnabled = false;
  let latencyProbeDone = false;
  let latencyProbeInFlight = false;
  let inFlightRequest = false;
  let autoTriggerTimer: NodeJS.Timeout | null = null;
  const recentLatencies: number[] = [];

  const diffTracker = new VscodeDiffTracker({
    maxTrajectory: 20,
    mergeWindowMs: 5000,
  });

  activateDataCollection(context);

  const MAX_LATENCY_SAMPLES = 5;
  const AUTO_TRIGGER_DEBOUNCE_MS = 50;
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

  function scheduleAutoTrigger() {
    if (!autoTriggerEnabled) {
      return;
    }
    if (autoTriggerTimer) {
      clearTimeout(autoTriggerTimer);
    }
    autoTriggerTimer = setTimeout(async () => {
      autoTriggerTimer = null;
      if (inFlightRequest) {
        autoTriggerTimer = setTimeout(() => {
          scheduleAutoTrigger();
        }, 80);
        return;
      }
      shouldProvideInlineEdit = true;
      await vscode.commands.executeCommand(
        "editor.action.inlineSuggest.trigger"
      );
    }, AUTO_TRIGGER_DEBOUNCE_MS);
  }

  function percentile(values: number[], percentileValue: number): number | null {
    if (values.length === 0) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil((percentileValue / 100) * sorted.length) - 1;
    const index = Math.min(sorted.length - 1, Math.max(0, rank));
    return sorted[index];
  }

  const inlineProvider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, context, token) {
      if (!shouldProvideInlineEdit) {
        return [];
      }
      shouldProvideInlineEdit = false;
      inFlightRequest = true;

      const requestId = randomUUID();
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
            requestId,
          },
          token
        );
        const elapsed = Date.now() - startTime;
        if (edit !== null) {
          pushSample(recentLatencies, elapsed, MAX_LATENCY_SAMPLES);
        }
        logTelemetry({
          type: "latency",
          timestamp: new Date().toISOString(),
          requestId,
          latencyMs: elapsed,
          hasCompletion: edit !== null,
        });
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
        correlationId: requestId,
        completeBracketPairs: true,
      };

      const list = new vscode.InlineCompletionList([item]);
      list.enableForwardStability = true;

      logTelemetry({
        type: "completion",
        timestamp: new Date().toISOString(),
        requestId,
        uri: document.uri.toString(),
        content: edit.content,
      });

      return list;
    },
    handleEndOfLifetime(completionItem, reason) {
      let reasonLabel = "unknown";
      switch (reason.kind) {
        case vscode.InlineCompletionEndOfLifeReasonKind.Accepted:
          // accepted: user explicitly applied the suggestion.
          reasonLabel = "accepted";
          break;
        case vscode.InlineCompletionEndOfLifeReasonKind.Rejected:
          // rejected: user explicitly dismissed the suggestion (e.g. Esc).
          reasonLabel = "rejected";
          break;
        case vscode.InlineCompletionEndOfLifeReasonKind.Ignored:
          // ignored: suggestion expired due to user typing/moving without explicit accept/reject.
          reasonLabel = "ignored";
          break;
      }

      const message = `Inline edit ${reasonLabel} (${
        completionItem.correlationId ?? "no id"
      })`;
      console.log(message, reason);
      vscode.window.setStatusBarMessage(message, 3000);
      logTelemetry({
        type: "outcome",
        timestamp: new Date().toISOString(),
        requestId: completionItem.correlationId ?? "unknown",
        outcome: reasonLabel,
      });
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
      if (event.contentChanges.length === 0) {
        return;
      }
      scheduleAutoTrigger();
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
      const logFilePath = getTelemetryLogPath();
      if (logFilePath && fs.existsSync(logFilePath)) {
        const logUri = vscode.Uri.file(logFilePath);
        vscode.window.showTextDocument(logUri);
      } else {
        vscode.window.showInformationMessage("No logs found.");
      }
    }
  );

  const telemetryStatsCommand = vscode.commands.registerCommand(
    "baby-copilot.showTelemetryStats",
    () => {
      const logFilePath = getTelemetryLogPath();
      if (!logFilePath || !fs.existsSync(logFilePath)) {
        vscode.window.showInformationMessage("No telemetry logs found.");
        return;
      }

      const contents = fs.readFileSync(logFilePath, "utf8");
      const lines = contents.split("\n").filter((line) => line.trim().length > 0);
      const latencies: number[] = [];
      let accepted = 0;
      let rejected = 0;

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as {
            type?: string;
            latencyMs?: number;
            outcome?: string;
          };
          if (event.type === "latency" && typeof event.latencyMs === "number") {
            latencies.push(event.latencyMs);
          } else if (event.type === "outcome") {
            if (event.outcome === "accepted") {
              accepted += 1;
            } else if (event.outcome === "rejected") {
              rejected += 1;
            }
          }
        } catch {
          continue;
        }
      }

      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);
      const totalDecisions = accepted + rejected;
      const acceptanceRate =
        totalDecisions === 0 ? null : (accepted / totalDecisions) * 100;

      const parts = [
        `p50=${p50 === null ? "n/a" : `${Math.round(p50)}ms`}`,
        `p95=${p95 === null ? "n/a" : `${Math.round(p95)}ms`}`,
        `p99=${p99 === null ? "n/a" : `${Math.round(p99)}ms`}`,
        `accept=${acceptanceRate === null ? "n/a" : `${acceptanceRate.toFixed(1)}%`}`,
        `n=${totalDecisions}`,
      ];
      vscode.window.showInformationMessage(
        `baby-copilot telemetry: ${parts.join(" ")}`
      );
    }
  );

  context.subscriptions.push(
    disposable,
    viewLogsCommand,
    telemetryStatsCommand,
    inlineCompletionProvider,
    openDocumentListener,
    closeDocumentListener,
    changeDocumentListener,
    activeEditorListener
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
