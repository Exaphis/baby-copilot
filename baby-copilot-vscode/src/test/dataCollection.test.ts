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

  test("Should create a snapshot on document open", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "Hello Snapshot",
      language: "text",
    });
    await vscode.window.showTextDocument(document);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const logFilePath = getLogFilePath();
    assert.ok(fs.existsSync(logFilePath), "Log file should exist");
    const logContent = fs.readFileSync(logFilePath, "utf-8");
    const logEntries = logContent.trim().split("\n").map(line => JSON.parse(line));

    const snapshotEvent = logEntries.find(entry => entry.type === 'snapshot');
    assert.ok(snapshotEvent, "Snapshot event should be logged");
    assert.strictEqual(snapshotEvent.content, "Hello Snapshot");
  });

  test("Should log edits as deltas after initial snapshot", async () => {
    const document = await vscode.workspace.openTextDocument({
      content: "", // Start with empty content
      language: "text",
    });
    const editor = await vscode.window.showTextDocument(document);
    await new Promise((resolve) => setTimeout(resolve, 200)); // allow initial snapshot of empty doc

    // Clear log file to only capture events from this point
    fs.writeFileSync(getLogFilePath(), "");

    // Insert initial content, this should be logged as an edit
    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), "Initial content");
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Perform the actual test edit
    await editor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 7), " more");
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const logFilePath = getLogFilePath();
    const logContent = fs.readFileSync(logFilePath, "utf-8");
    const logEntries = logContent.trim().split("\n").map(line => JSON.parse(line));

    const editEvents = logEntries.filter(entry => entry.type === 'edit');
    assert.strictEqual(editEvents.length, 2, "Should log two edit events (initial content + test edit)");
    assert.deepStrictEqual(editEvents[1].changes[0].text, " more");
  });

  test("Should create a new snapshot on external file change", async () => {
    const tempFilePath = path.join(getExtensionContext().globalStorageUri.fsPath, 'test.txt');
    fs.writeFileSync(tempFilePath, "External content");

    const document = await vscode.workspace.openTextDocument(tempFilePath);
    await vscode.window.showTextDocument(document);
    await new Promise((resolve) => setTimeout(resolve, 200)); // allow initial snapshot to be created

    // Simulate external change
    fs.writeFileSync(tempFilePath, "Updated external content");
    await new Promise((resolve) => setTimeout(resolve, 200)); // allow watcher to trigger

    // Trigger an internal edit to force a new snapshot after external change
    await vscode.window.activeTextEditor?.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), ""); // No actual change, just to trigger onDidChangeTextDocument
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const logFilePath = getLogFilePath();
    const logContent = fs.readFileSync(logFilePath, "utf-8");
    const logEntries = logContent.trim().split("\n").map(line => JSON.parse(line));

    const snapshotEvents = logEntries.filter(entry => entry.type === 'snapshot');
    assert.strictEqual(snapshotEvents.length, 2, "Should be two snapshot events");
    assert.strictEqual(snapshotEvents[0].content, "External content");
    assert.strictEqual(snapshotEvents[1].content, "Updated external content");

    fs.unlinkSync(tempFilePath);
  });
});
