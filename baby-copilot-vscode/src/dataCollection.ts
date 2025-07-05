import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const watchers = new Map<string, fs.FSWatcher>();
const externallyChangedURIs = new Set<string>();

export function activateDataCollection(context: vscode.ExtensionContext) {
  const storagePath = context.globalStorageUri.fsPath;
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  const logFilePath = path.join(storagePath, "events.log");
  console.log(`Data collection log file path: ${logFilePath}`);

  const documentStates = new Map<
    string,
    { content: string; hasLoggedSnapshot: boolean }
  >();

  const isTrackableDocument = (doc: vscode.TextDocument) => {
    return doc.uri.scheme === "file" || doc.uri.scheme === "untitled";
  };

  const logFullSnapshot = (doc: vscode.TextDocument) => {
    const uriString = doc.uri.toString();
    const content = doc.getText();
    documentStates.set(uriString, { content, hasLoggedSnapshot: true });

    const snapshotData = {
      type: "snapshot",
      timestamp: new Date().toISOString(),
      uri: uriString,
      content,
    };
    fs.appendFileSync(logFilePath, JSON.stringify(snapshotData) + "\n");
  };

  const setupWatcher = (doc: vscode.TextDocument) => {
    const uriString = doc.uri.toString();
    if (doc.uri.scheme === "file" && !watchers.has(uriString)) {
      const watcher = fs.watch(doc.fileName, (eventType) => {
        if (eventType === "change") {
          externallyChangedURIs.add(uriString);
        }
      });
      watchers.set(uriString, watcher);
    }
  };

  vscode.workspace.textDocuments.forEach((doc) => {
    if (isTrackableDocument(doc)) {
      logFullSnapshot(doc);
      setupWatcher(doc);
    }
  });

  vscode.workspace.onDidOpenTextDocument((doc) => {
    if (isTrackableDocument(doc) && !documentStates.has(doc.uri.toString())) {
      logFullSnapshot(doc);
      setupWatcher(doc);
    }
  });

  vscode.workspace.onDidCloseTextDocument((doc) => {
    const uriString = doc.uri.toString();
    documentStates.delete(uriString);
    externallyChangedURIs.delete(uriString);
    const watcher = watchers.get(uriString);
    if (watcher) {
      watcher.close();
      watchers.delete(uriString);
    }
  });

  vscode.workspace.onDidChangeTextDocument((event) => {
    if (!isTrackableDocument(event.document)) {
      return;
    }

    const uriString = event.document.uri.toString();

    if (externallyChangedURIs.has(uriString)) {
      externallyChangedURIs.delete(uriString);
      logFullSnapshot(event.document);
      return;
    }

    const state = documentStates.get(uriString);

    if (!state || !state.hasLoggedSnapshot) {
      logFullSnapshot(event.document);
    } else {
      const editData = {
        type: "edit",
        timestamp: new Date().toISOString(),
        uri: uriString,
        changes: event.contentChanges.map((change) => ({
          range: {
            start: {
              line: change.range.start.line,
              character: change.range.start.character,
            },
            end: {
              line: change.range.end.line,
              character: change.range.end.character,
            },
          },
          text: change.text,
        })),
      };
      fs.appendFileSync(logFilePath, JSON.stringify(editData) + "\n");
    }
    documentStates.set(uriString, {
      content: event.document.getText(),
      hasLoggedSnapshot: true,
    });
  });

  vscode.window.onDidChangeTextEditorSelection((event) => {
    if (!isTrackableDocument(event.textEditor.document)) {
      return;
    }

    const cursorData = {
      type: "cursor",
      timestamp: new Date().toISOString(),
      uri: event.textEditor.document.uri.toString(),
      selections: event.selections.map((selection) => ({
        start: {
          line: selection.start.line,
          character: selection.start.character,
        },
        end: {
          line: selection.end.line,
          character: selection.end.character,
        },
      })),
    };
    fs.appendFileSync(logFilePath, JSON.stringify(cursorData) + "\n");
  });
}

export function deactivate() {
  watchers.forEach((watcher) => watcher.close());
  watchers.clear();
}
