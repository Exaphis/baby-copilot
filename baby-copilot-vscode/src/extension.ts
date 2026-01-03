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

  const diffTracker = new VscodeDiffTracker({
    maxTrajectory: 20,
    mergeWindowMs: 5000,
  });

  const inlineProvider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, context, token) {
      if (!shouldProvideInlineEdit) {
        return [];
      }
      shouldProvideInlineEdit = false;

      const rangeForSnippet = document.validateRange(
        new vscode.Range(
          Math.max(position.line - 10, 0),
          0,
          position.line + 10,
          0
        )
      );
      let edit = await nesUtils.requestEdit(
        {
          doc: document,
          diffTrajectory: diffTracker.diffTrajectory,
          cursor: position,
          editableRange: rangeForSnippet,
        },
        token
      );

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
    changeDocumentListener
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
