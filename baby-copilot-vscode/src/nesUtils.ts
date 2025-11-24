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

// Inline completion support
let inlineSuggestionState: {
  uri: vscode.Uri;
  position: vscode.Position;
  text: string;
} | null = null;
let inlineProviderRegistration: vscode.Disposable | null = null;

export function initInlineCompletionProvider(context: vscode.ExtensionContext) {
  if (inlineProviderRegistration) {
    return; // already registered
  }
  inlineProviderRegistration =
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      {
        provideInlineCompletionItems(doc, pos) {
          if (
            inlineSuggestionState &&
            doc.uri.toString() === inlineSuggestionState.uri.toString() &&
            pos.isEqual(inlineSuggestionState.position) &&
            inlineSuggestionState.text.length > 0
          ) {
            const item = new vscode.InlineCompletionItem(
              inlineSuggestionState.text,
              new vscode.Range(pos, pos)
            );
            return { items: [item] };
          }
          return { items: [] };
        },
      }
    );
  context.subscriptions.push(inlineProviderRegistration);
}

export function updateInlineSuggestion(
  state: { uri: vscode.Uri; position: vscode.Position; text: string } | null
) {
  inlineSuggestionState = state;
}

export function getInlineSuggestionState(): {
  uri: vscode.Uri;
  position: vscode.Position;
  text: string;
} | null {
  return inlineSuggestionState;
}

// Compute whether proposed content is the same as current editable content
// with only an insertion at the user's cursor. If so, return the inserted text.
export function computeInlineAddition(
  context: NesContext,
  proposed: string
): string | null {
  const doc = context.doc;
  const current = doc.getText(context.editableRange);

  // Split current by cursor
  const cursorOffset =
    doc.offsetAt(context.cursor) - doc.offsetAt(context.editableRange.start);
  if (cursorOffset < 0 || cursorOffset > current.length) {
    return null;
  }
  const before = current.slice(0, cursorOffset);
  const after = current.slice(cursorOffset);

  // Proposed must contain before and after in order with only extra text between
  if (!proposed.startsWith(before)) {
    return null;
  }
  if (!proposed.endsWith(after)) {
    return null;
  }
  const inserted = proposed.slice(
    before.length,
    proposed.length - after.length
  );
  // If proposed is identical (no insertion), treat as no-op
  if (inserted.length === 0) {
    return null;
  }
  return inserted;
}

export async function requestEdit(
  context: NesContext,
  token: vscode.CancellationToken
): Promise<NesSuggestion | null> {
  try {
    if (token.isCancellationRequested) {
      return null;
    }

    const url = "http://localhost:8001/predict-edit";

    // Wire cancellation
    const controller = new AbortController();
    const onCancel = () => controller.abort();
    token.onCancellationRequested(onCancel);

    try {
      const reqStart = Date.now();

      // Get editable content
      const editableContent = context.doc.getText(context.editableRange);

      // Calculate cursor offset within editable range
      const cursorOffset =
        context.doc.offsetAt(context.cursor) -
        context.doc.offsetAt(context.editableRange.start);

      // Build request body
      const requestBody = {
        filePath: context.doc.uri.fsPath,
        editableContent,
        cursorOffset,
        diffTrajectory: context.diffTrajectory,
        contextItems: [],
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const buildTime = Date.now() - reqStart;
      console.log(`[Timing] Build request: ${buildTime}ms`);

      const fetchStart = Date.now();
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const fetchTime = Date.now() - fetchStart;
      console.log(`[Timing] Fetch complete: ${fetchTime}ms`);

      if (!resp.ok) {
        const elapsed = Date.now() - reqStart;
        const errText = await resp.text;
        console.error(
          `DSPy server error ${resp.status}: ${resp.statusText} (after ${elapsed}ms)\n${errText}`
        );
        return null;
      }

      const parseStart = Date.now();
      const data = (await resp.json()) as any;
      const parseTime = Date.now() - parseStart;
      console.log(`[Timing] Parse JSON: ${parseTime}ms`);
      const content: string | undefined = data?.content ?? undefined;
      if (!content || typeof content !== "string") {
        const elapsed = Date.now() - reqStart;
        console.warn("DSPy server returned empty content");
        console.warn(`requestEdit latency (empty): ${elapsed}ms`);
        return null;
      }

      // If generated edit matches current editable text, return null (no suggestion)
      const currentEditable = context.doc.getText(context.editableRange);
      if (currentEditable === content) {
        const elapsedNoChange = Date.now() - reqStart;
        console.log(`requestEdit latency (no-change): ${elapsedNoChange}ms`);
        return null;
      }

      const elapsed = Date.now() - reqStart;
      console.log(`[Timing] Total e2e: ${elapsed}ms; model=dspy`);
      return { content };
    } finally {
      // best-effort cleanup for the cancellation handler
      token.onCancellationRequested(() => {});
    }
  } catch (err) {
    console.error("requestEdit failed:", err);
    return null;
  }
}
