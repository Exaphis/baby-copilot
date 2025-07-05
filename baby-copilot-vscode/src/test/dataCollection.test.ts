import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getExtensionContext } from "../extension";

suite("Data Collection Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  const getLogFilePath = () => {
    const context = getExtensionContext();
    const storagePath = context.globalStorageUri.fsPath;
    return path.join(storagePath, "events.log");
  };

  setup(() => {
    const logFilePath = getLogFilePath();
    if (fs.existsSync(logFilePath)) {
      fs.unlinkSync(logFilePath);
    }
  });

  test("Should record edit events", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "Hello",
      language: "text",
    });
    const editor = await vscode.window.showTextDocument(document);
    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 5), " World");
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const logFilePath = getLogFilePath();
    assert.ok(fs.existsSync(logFilePath), "Log file should exist");
    const logContent = fs.readFileSync(logFilePath, "utf-8");
    const logEntries = logContent
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const editEvent = logEntries.find(
      (entry) =>
        entry.type === "edit" &&
        entry.beforeEditContent === "Hello" &&
        entry.changes &&
        entry.changes.length > 0 &&
        entry.changes[0].text === " World"
    );
    assert.ok(editEvent, "Did not find the expected edit event");
  });

  test("Should record cursor events", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "Hello",
      language: "text",
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(
      new vscode.Position(0, 2),
      new vscode.Position(0, 4)
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const logFilePath = getLogFilePath();
    assert.ok(fs.existsSync(logFilePath), "Log file should exist");
    const logContent = fs.readFileSync(logFilePath, "utf-8");
    const logEntries = logContent
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const cursorEvents = logEntries.filter((entry) => entry.type === "cursor");
    assert.ok(cursorEvents.length > 0, "Should have at least one cursor event");
    const lastCursorEvent = cursorEvents[cursorEvents.length - 1];
    assert.deepStrictEqual(lastCursorEvent.selections[0].start, {
      line: 0,
      character: 2,
    });
    assert.deepStrictEqual(lastCursorEvent.selections[0].end, {
      line: 0,
      character: 4,
    });
  });

  test("Should replay edits and match final content", async () => {
    const initialContent = "line 1\nline 2\nline 3";
    const document = await vscode.workspace.openTextDocument({
      content: initialContent,
      language: "text",
    });
    const editor = await vscode.window.showTextDocument(document);

    // Edit 1
    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(1, 6), " modified");
    });
    const contentAfterEdit1 = document.getText();

    // Edit 2
    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), "START\n");
    });
    const finalContent = document.getText();

    // Wait for events to be logged
    await new Promise((resolve) => setTimeout(resolve, 200));

    const logFilePath = getLogFilePath();
    assert.ok(fs.existsSync(logFilePath), "Log file should exist");
    const logContent = fs.readFileSync(logFilePath, "utf-8");
    const logEntries = logContent
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    const editEvents = logEntries.filter((entry) => entry.type === "edit");
    assert.strictEqual(editEvents.length, 3, "Expected exactly three edit events");

    const applyLoggedChanges = (content: string, changes: any[]): string => {
        const sortedChanges = [...changes].sort((a, b) => {
            if (a.range.start.line > b.range.start.line) { return -1; }
            if (a.range.start.line < b.range.start.line) { return 1; }
            if (a.range.start.character > b.range.start.character) { return -1; }
            if (a.range.start.character < b.range.start.character) { return 1; }
            return 0;
        });

        let modifiedContent = content;
        for (const change of sortedChanges) {
            const { start, end } = change.range;
            const { text } = change;

            const lines = modifiedContent.split('\n');
            const getIndex = (pos: { line: number, character: number }) => {
                let index = 0;
                for (let i = 0; i < pos.line; i++) {
                    index += lines[i].length + 1;
                }
                index += pos.character;
                return index;
            };

            const startIndex = getIndex(start);
            const endIndex = getIndex(end);

            modifiedContent = modifiedContent.slice(0, startIndex) + text + modifiedContent.slice(endIndex);
        }
        return modifiedContent;
    };

    // Verify first event
    assert.strictEqual(editEvents[1].beforeEditContent, initialContent);
    const replayedContent1 = applyLoggedChanges(editEvents[1].beforeEditContent, editEvents[1].changes);
    assert.strictEqual(replayedContent1, contentAfterEdit1);

    // Verify second event
    assert.strictEqual(editEvents[2].beforeEditContent, contentAfterEdit1);
    const replayedContent2 = applyLoggedChanges(editEvents[2].beforeEditContent, editEvents[2].changes);
    assert.strictEqual(replayedContent2, finalContent);
  });
});
