import * as vscode from "vscode";
import { activateDataCollection } from "./dataCollection";
import * as fs from 'fs';
import * as path from 'path';

let extContext: vscode.ExtensionContext;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  extContext = context;
  console.log('Congratulations, your extension "baby-copilot" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "baby-copilot.helloWorld",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("Hello World from Baby Copilot!");
    }
  );

  const viewLogsCommand = vscode.commands.registerCommand(
    "baby-copilot.viewLogs",
    () => {
      const storagePath = context.globalStorageUri.fsPath;
      const logFilePath = path.join(storagePath, 'events.log');
      if (fs.existsSync(logFilePath)) {
        const logUri = vscode.Uri.file(logFilePath);
        vscode.window.showTextDocument(logUri);
      } else {
        vscode.window.showInformationMessage("No logs found.");
      }
    }
  );

  context.subscriptions.push(disposable, viewLogsCommand);

  vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    {
      provideInlineCompletionItems: (document, position) => {
        // This is a simple inline completion provider that suggests "Hello World!" at the current position
        return [new vscode.InlineCompletionItem("Hello World!")];
      },
    }
  );

  activateDataCollection(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}

export function getExtensionContext() {
    return extContext;
}
