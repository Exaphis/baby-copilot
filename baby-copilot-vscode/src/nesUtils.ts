import * as vscode from "vscode";

export interface Diff {
  path: string; // path to the file
  diff: string; // diff in unified format
}

export interface NesContext {
  doc: vscode.TextDocument; // document being edited
  diffTrajectory: Diff[]; // trajectory of diffs
  cursor: vscode.Position; // cursor position in the file
  editableRange: vscode.Range; // range that can be edited
}

export interface NesSuggestion {
  content: string; // new contents of the editable range
}

export async function requestEdit(
  context: NesContext,
  token: vscode.CancellationToken
): Promise<NesSuggestion | null> {
  if (token.isCancellationRequested) {
    return null;
  }

  // Simulate a request to an external service
  // In a real implementation, this would be an HTTP request to a server
  const editableContent = context.doc.getText(context.editableRange);
  const lines = editableContent.split("\n");

  // shuffle lines to create a random perturbation
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }

  const newContent = lines.join("\n");
  return { content: newContent };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        content: newContent,
      });
    }, 500);

    token.onCancellationRequested(() => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}
