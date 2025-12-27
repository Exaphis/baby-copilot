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
