import * as vscode from "vscode";
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

// Next edit suggestion
let nesDecorationType: vscode.TextEditorDecorationType | null = null;
// Cursor movement suggestion
let cmsDecorationType: vscode.TextEditorDecorationType | null = null;

interface SuggestionResult {
  nesResult: {
    nesDecorationType: vscode.TextEditorDecorationType;
    range: vscode.Range;
  } | null;
  cmsResult: {
    cmsDecorationType: vscode.TextEditorDecorationType;
    range: vscode.Range;
  } | null;
}

let suggestCts: vscode.CancellationTokenSource | null = null;

async function triggerSuggestions() {
  // Cancel any in-flight request
  suggestCts?.cancel();
  suggestCts?.dispose();

  nesDecorationType?.dispose();
  cmsDecorationType?.dispose();

  suggestCts = new vscode.CancellationTokenSource();
  const result = await requestSuggestions(suggestCts.token);
  if (!result || suggestCts.token.isCancellationRequested) {
    return;
  }

  const { nesResult, cmsResult } = result;
  if (nesResult) {
    nesDecorationType = nesResult.nesDecorationType;
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      activeEditor.setDecorations(nesDecorationType, [nesResult.range]);
    }
  }

  if (cmsResult) {
    cmsDecorationType = cmsResult.cmsDecorationType;
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      activeEditor.setDecorations(cmsDecorationType, [cmsResult.range]);
    }
  }
}

async function requestSuggestions(
  token: vscode.CancellationToken
): Promise<SuggestionResult | null> {
  if (token.isCancellationRequested) {
    return null;
  }

  // wait random time to simulate a delay (0.25 to 0.5s)
  // await new Promise((resolve) =>
  //   setTimeout(resolve, Math.random() * 250 + 250)
  // );

  let activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor || token.isCancellationRequested) {
    return null;
  }

  const document = activeEditor.document;
  const position = activeEditor.selection.active;

  const startLineForSnippet = position.line;
  const endLineForSnippet = Math.min(document.lineCount - 1, position.line + 3);

  const rangeForSnippet = new vscode.Range(
    startLineForSnippet,
    0,
    endLineForSnippet,
    document.lineAt(endLineForSnippet).text.length
  );
  const code = document.getText(rangeForSnippet);
  const language = document.languageId;

  // Next Edit Suggestions
  const deletedLineInSnippet = 1; // The first line in the snippet is the one at the cursor
  const newDiffLines: { lineNumber: number; type: "added" | "deleted" }[] = [
    { lineNumber: deletedLineInSnippet, type: "deleted" },
  ];
  if (position.line + 1 < document.lineCount) {
    newDiffLines.push({
      lineNumber: deletedLineInSnippet + 1,
      type: "added",
    });
  }

  const nesDimensions = {
    width: 240,
    height: 80,
  };

  const uri = vscode.window.activeTextEditor?.document.uri; // pass a URI so VS Code can
  // apply folder- or language-specific
  // overrides when they exist
  const editorCfg = vscode.workspace.getConfiguration("editor", uri);

  const fontFamily = editorCfg.get<string>("fontFamily") || " monospace";
  const fontSize = editorCfg.get<number>("fontSize") || 14;
  const lineHeight = getEffectiveLineHeight(editorCfg);

  const cr = CodeRenderer.getInstance();
  await cr.setTheme("dark-plus");
  const svgData = await cr.getDataUri(
    code,
    language,
    {
      imageType: "svg",
      fontFamily,
      fontSize,
      lineHeight,
      dimensions: nesDimensions,
    },
    startLineForSnippet, // currLineOffsetFromTop is the starting line number of the snippet
    newDiffLines
  );

  nesDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    before: {
      width: `${nesDimensions.width}px`,
      height: `${nesDimensions.height}px`,
      textDecoration: "; position: absolute; margin-left: 15ch; z-index: 1000;",
      contentIconPath: vscode.Uri.parse(svgData),
    },
  });

  const nesRange = activeEditor.document.lineAt(position.line).range;

  // cursor movement
  const cmsSvgPath = path.join(
    extContext.extensionPath,
    "src",
    "cursorSuggestion.svg"
  );
  const cmsSvgData = fs.readFileSync(cmsSvgPath, "utf8");
  const contentIconBase64 =
    "data:image/svg+xml;base64," + Buffer.from(cmsSvgData).toString("base64");
  cmsDecorationType = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    after: {
      // TODO: it doesn't show up if we don't set aspect-ratio... why?
      textDecoration: `; position: absolute; z-index: 1000; height: ${lineHeight}px; aspect-ratio: 220.86 / 43.92;`,
      contentIconPath: vscode.Uri.parse(contentIconBase64),
    },
  });
  const cursorDecorations: vscode.DecorationOptions[] = [];
  const cursorRange = new vscode.Range(
    position.line + 1,
    0,
    position.line + 1,
    0
  );
  cursorDecorations.push({ range: cursorRange });
  activeEditor.setDecorations(cmsDecorationType, cursorDecorations);

  return {
    nesResult: {
      nesDecorationType,
      range: nesRange,
    },
    cmsResult: {
      cmsDecorationType,
      range: cursorRange,
    },
  };
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  extContext = context;

  const cr = CodeRenderer.getInstance();
  await cr.setTheme("dark-plus");

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

  vscode.window.onDidChangeTextEditorSelection(async (event) => {
    await triggerSuggestions();
  });

  vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    await triggerSuggestions();
  });

  await triggerSuggestions();
}

// This method is called when your extension is deactivated
export function deactivate() {}

export function getExtensionContext() {
  return extContext;
}
