import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
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

  context.subscriptions.push(disposable);

  vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    {
      provideInlineCompletionItems: (document, position) => {
        // This is a simple inline completion provider that suggests "Hello World!" at the current position
        return [new vscode.InlineCompletionItem("Hello World!")];
      },
    }
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
