import * as assert from "assert";
import * as vscode from "vscode";
import { VscodeDiffTracker } from "../adapter/vscodeDiffTracker";

suite("Extension Test Suite", () => {
  test("VscodeDiffTracker records a diff after edits", async () => {
    const diffTracker = new VscodeDiffTracker();
    const doc = await vscode.workspace.openTextDocument({ content: "one\n" });
    const editor = await vscode.window.showTextDocument(doc);

    diffTracker.handleOpen(doc);

    const changePromise = new Promise<void>((resolve) => {
      const subscription = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document !== doc) {
          return;
        }
        diffTracker.handleChange(event);
        subscription.dispose();
        resolve();
      });
    });

    await editor.edit((editBuilder) => {
      const end = doc.lineAt(doc.lineCount - 1).range.end;
      editBuilder.replace(
        new vscode.Range(0, 0, end.line, end.character),
        "one\ntwo\n"
      );
    });

    await changePromise;

    assert.strictEqual(diffTracker.diffTrajectory.length, 1);
    assert.match(diffTracker.diffTrajectory[0].diff, /\+two/);
  });
});
