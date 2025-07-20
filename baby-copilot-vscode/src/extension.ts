import * as vscode from "vscode";
import { activateDataCollection } from "./dataCollection.js";
import * as fs from "fs";
import * as path from "path";
import { CodeRenderer } from "./codeRenderer.js";

let extContext: vscode.ExtensionContext;

function getEffectiveLineHeight(cfg: vscode.WorkspaceConfiguration): number {
  const lineHeight = cfg.get<number>("lineHeight") || 0;
  const fontSize = cfg.get<number>("fontSize") || 14;

  // https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/config/fontInfo.ts
  const GOLDEN_LINE_HEIGHT_RATIO = process.platform === "darwin" ? 1.5 : 1.35;
  const MINIMUM_LINE_HEIGHT = 8;
  if (lineHeight === 0) {
    return GOLDEN_LINE_HEIGHT_RATIO * fontSize;
  } else if (lineHeight < MINIMUM_LINE_HEIGHT) {
    // Values too small to be line heights in pixels are in ems.
    return lineHeight * fontSize;
  }
  return lineHeight;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
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
      const logFilePath = path.join(storagePath, "events.log");
      if (fs.existsSync(logFilePath)) {
        const logUri = vscode.Uri.file(logFilePath);
        vscode.window.showTextDocument(logUri);
      } else {
        vscode.window.showInformationMessage("No logs found.");
      }
    }
  );

  context.subscriptions.push(disposable, viewLogsCommand);

  const uri = vscode.window.activeTextEditor?.document.uri; // pass a URI so VS Code can
  // apply folder- or language-specific
  // overrides when they exist
  const editorCfg = vscode.workspace.getConfiguration("editor", uri);

  const fontFamily = editorCfg.get<string>("fontFamily") || " monospace";
  const fontSize = editorCfg.get<number>("fontSize") || 14;
  const lineHeight = getEffectiveLineHeight(editorCfg);
  console.log("font size", fontSize);
  console.log("effective line height", lineHeight);

  console.log(
    `Font: ${fontFamily}  size: ${fontSize}px  line-height: ${lineHeight}px`
  );

  const cr = CodeRenderer.getInstance();
  const dimensions = {
    width: 240,
    height: 80,
  };
  await cr.setTheme("dark-plus");
  const svgData = await cr.getDataUri(
    "console.log('Hello, world!');\n// foobar",
    "javascript",
    {
      imageType: "svg",
      fontFamily,
      fontSize,
      lineHeight,
      dimensions,
    },
    0,
    []
  );

  const outlineDecorationType = vscode.window.createTextEditorDecorationType({
    border: "1px solid red",
    isWholeLine: true,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    before: {
      width: "240px",
      height: "80px",
      textDecoration: "; position: absolute; margin-left: 15ch",
      contentIconPath: vscode.Uri.parse(svgData),
    },
  });

  let activeEditor = vscode.window.activeTextEditor;

  function updateDecorations() {
    if (!activeEditor) {
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];
    const position = activeEditor.selection.active;
    // modify position to place the decoration at the end of the line
    const lineStart = activeEditor.document.lineAt(position.line).range.start;
    const lineEnd = activeEditor.document
      .lineAt(position.line)
      .range.start.translate(0, 2);
    const range = new vscode.Range(lineStart, lineEnd);
    decorations.push({ range });
    activeEditor.setDecorations(outlineDecorationType, decorations);
  }

  vscode.window.onDidChangeTextEditorSelection((event) => {
    if (event.textEditor === activeEditor) {
      updateDecorations();
    }
  });

  vscode.window.onDidChangeActiveTextEditor((editor) => {
    activeEditor = editor;
    if (activeEditor) {
      updateDecorations();
    }
  });

  if (activeEditor) {
    updateDecorations();
  }

  activateDataCollection(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}

export function getExtensionContext() {
  return extContext;
}
