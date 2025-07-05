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
});
