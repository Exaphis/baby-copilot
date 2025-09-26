// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "vscode-ext-playground" is now active!'
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "vscode-ext-playground.helloWorld",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage(
        "Hello World from vscode-ext-playground!"
      );
    }
  );

  context.subscriptions.push(disposable);

  const editor = vscode.window.activeTextEditor;
  console.log(editor);
  if (!editor) {
    return;
  }

  // Create a decoration type (you can also set 'before' instead of 'after')
  const decoType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: " ← hello from a decoration",
      // optional styling:
      color: new vscode.ThemeColor("editorCodeLens.foreground"),
      margin: "0 0 0 8px",
      textDecoration:
        "none; padding: 0 4px; border: 1px solid red; border-radius: 3px;",
    },
  });

  const pos = new vscode.Position(5, 0);
  const opts: vscode.DecorationOptions = { range: new vscode.Range(pos, pos) };

  // Apply the decoration
  editor.setDecorations(decoType, [opts]);

  context.subscriptions.push(decoType);
}

// This method is called when your extension is deactivated
export function deactivate() {}
