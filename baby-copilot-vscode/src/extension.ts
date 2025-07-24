import * as vscode from "vscode";
import { activateDataCollection } from "./dataCollection.js";
import * as fs from "fs";
import * as path from "path";
import { CodeRenderer } from "./codeRenderer.js";
import { request } from "http";

let extContext: vscode.ExtensionContext;

const cmsSvgData = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_2" data-name="Layer 2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220.86 43.92">
  <defs>
    <style>
      .cls-1 {
        fill: #666766;
      }

      .cls-1, .cls-2 {
        opacity: .8;
      }

      .cls-2, .cls-3 {
        fill: none;
      }

      .cls-4 {
        fill: #9a9bad;
      }

      .cls-5 {
        fill: #32464a;
      }

      .cls-6 {
        fill: #27363d;
      }

      .cls-7 {
        fill: #cad3d3;
      }

      .cls-8 {
        fill: #8cbfcd;
      }

      .cls-3 {
        opacity: .95;
      }
    </style>
  </defs>
  <g id="Layer_2-2" data-name="Layer 2">
    <rect class="cls-8" x="0" y="4.89" width="4.14" height="34.14" rx="2.07" ry="2.07"/>
  </g>
  <g id="Layer_4" data-name="Layer 4">
    <g class="cls-2">
      <path class="cls-6" d="m14.45.75h199.76c3.26,0,5.9,2.64,5.9,5.9v30.62c0,3.26-2.64,5.9-5.9,5.9H14.45c-3.26,0-5.9-2.64-5.9-5.9V6.65c0-3.26,2.64-5.9,5.9-5.9Z"/>
      <path class="cls-5" d="m214.21,1.5c2.84,0,5.15,2.31,5.15,5.15v30.62c0,2.84-2.31,5.15-5.15,5.15H14.45c-2.84,0-5.15-2.31-5.15-5.15V6.65c0-2.84,2.31-5.15,5.15-5.15h199.76m0-1.5H14.45c-3.67,0-6.65,2.98-6.65,6.65v30.62c0,3.67,2.98,6.65,6.65,6.65h199.76c3.67,0,6.65-2.98,6.65-6.65V6.65c0-3.67-2.98-6.65-6.65-6.65h0Z"/>
    </g>
    <rect class="cls-1" x="22.66" y="9.34" width="52.63" height="25.24" rx="5.45" ry="5.45"/>
    <g class="cls-3">
      <path class="cls-4" d="m84.24,25.78v-6.5h-1.75v-1.51l1.84-.11.24-3.3h1.66v3.3h3.19v1.62h-3.19v6.54c0,1.44.46,2.27,1.82,2.27.42,0,.96-.16,1.34-.32l.38,1.5c-.66.22-1.45.44-2.18.44-2.5,0-3.35-1.59-3.35-3.92Z"/>
      <path class="cls-4" d="m90.33,23.55c0-3.92,2.57-6.18,5.45-6.18s5.45,2.26,5.45,6.18-2.57,6.15-5.45,6.15-5.45-2.26-5.45-6.15Zm8.84,0c0-2.69-1.37-4.53-3.39-4.53s-3.39,1.83-3.39,4.53,1.37,4.5,3.39,4.5,3.39-1.8,3.39-4.5Z"/>
      <path class="cls-4" d="m105.04,34.35l.39-1.52c.31.1.7.21,1.12.21,1.18,0,1.45-.88,1.45-2.31v-13.08h1.99v13.08c0,2.4-.88,3.92-3.22,3.92-.72,0-1.31-.15-1.72-.31Zm2.59-20.4c0-.78.6-1.29,1.37-1.29s1.37.5,1.37,1.29-.6,1.29-1.37,1.29-1.37-.53-1.37-1.29Z"/>
      <path class="cls-4" d="m113.27,25.11v-7.45h1.99v7.19c0,2.19.66,3.13,2.22,3.13,1.2,0,2.03-.6,3.15-1.98v-8.34h1.99v11.76h-1.64l-.17-1.84h-.07c-1.09,1.28-2.26,2.13-3.88,2.13-2.48,0-3.59-1.6-3.59-4.6Z"/>
      <path class="cls-4" d="m126.05,17.66h1.64l.17,1.7h.07c1.03-1.11,2.26-1.99,3.66-1.99,1.8,0,2.76.86,3.25,2.24,1.22-1.32,2.45-2.24,3.88-2.24,2.42,0,3.58,1.6,3.58,4.6v7.45h-1.99v-7.19c0-2.19-.69-3.13-2.19-3.13-.91,0-1.86.6-2.95,1.81v8.51h-1.99v-7.19c0-2.19-.69-3.13-2.19-3.13-.88,0-1.86.6-2.95,1.81v8.51h-1.99v-11.76Z"/>
      <path class="cls-4" d="m145.57,17.66h1.64l.17,1.36h.07c1.06-.88,2.39-1.65,3.75-1.65,3.04,0,4.66,2.36,4.66,5.99,0,4.01-2.41,6.35-5.09,6.35-1.08,0-2.18-.5-3.26-1.36l.05,2.05v3.98h-1.99v-16.72Zm8.23,5.72c0-2.59-.89-4.33-3.1-4.33-1,0-2,.55-3.14,1.6v6.16c1.06.89,2.09,1.22,2.86,1.22,1.95,0,3.38-1.75,3.38-4.65Z"/>
      <path class="cls-4" d="m162.66,12.18h1.99v4.71l-.07,2.42c1.1-1.06,2.29-1.95,3.9-1.95,2.48,0,3.59,1.6,3.59,4.6v7.45h-1.99v-7.19c0-2.19-.66-3.13-2.22-3.13-1.2,0-2.03.61-3.21,1.81v8.51h-1.99V12.18Z"/>
      <path class="cls-4" d="m174.41,23.55c0-3.83,2.58-6.18,5.28-6.18,3,0,4.69,2.15,4.69,5.52,0,.42-.04.84-.09,1.13h-7.92c.14,2.49,1.67,4.1,3.91,4.1,1.13,0,2.05-.36,2.93-.94l.71,1.31c-1.03.67-2.28,1.22-3.88,1.22-3.13,0-5.63-2.29-5.63-6.15Zm8.22-.96c0-2.36-1.06-3.64-2.9-3.64-1.65,0-3.13,1.33-3.37,3.64h6.27Z"/>
      <path class="cls-4" d="m186.75,17.66h1.64l.17,2.14h.07c.82-1.49,2.02-2.43,3.34-2.43.52,0,.89.07,1.25.24l-.37,1.75c-.4-.13-.67-.19-1.14-.19-.99,0-2.18.72-2.97,2.7v7.55h-1.99v-11.76Z"/>
      <path class="cls-4" d="m193.5,23.55c0-3.83,2.58-6.18,5.28-6.18,3,0,4.69,2.15,4.69,5.52,0,.42-.04.84-.09,1.13h-7.92c.14,2.49,1.67,4.1,3.91,4.1,1.13,0,2.05-.36,2.93-.94l.71,1.31c-1.03.67-2.28,1.22-3.88,1.22-3.13,0-5.63-2.29-5.63-6.15Zm8.22-.96c0-2.36-1.06-3.64-2.9-3.64-1.65,0-3.13,1.33-3.37,3.64h6.27Z"/>
    </g>
    <g class="cls-3">
      <path class="cls-7" d="m33.98,17.08h-4.39v-3.02h12.38v3.02h-4.39v12.92h-3.6v-12.92Z"/>
      <path class="cls-7" d="m46.18,14.06h4.31l5.01,15.94h-3.81l-2.09-8.07c-.44-1.59-.87-3.48-1.29-5.14h-.1c-.39,1.68-.81,3.55-1.25,5.14l-2.09,8.07h-3.68l5.01-15.94Zm-1.71,9.34h7.67v2.8h-7.67v-2.8Z"/>
      <path class="cls-7" d="m56.77,14.06h5.46c3.31,0,5.88.91,5.88,3.95,0,1.43-.8,2.95-2.1,3.44v.1c1.63.42,2.89,1.62,2.89,3.75,0,3.24-2.74,4.7-6.21,4.7h-5.91v-15.94Zm5.29,6.38c1.75,0,2.52-.74,2.52-1.9,0-1.23-.82-1.71-2.5-1.71h-1.71v3.6h1.69Zm.33,6.78c1.96,0,2.98-.7,2.98-2.15s-1-1.97-2.98-1.97h-2.01v4.12h2.01Z"/>
    </g>
  </g>
</svg>
`;

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
  const contentIconBase64 =
    "data:image/svg+xml;base64," + Buffer.from(cmsSvgData).toString("base64");
  cmsDecorationType = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    after: {
      textDecoration: `; position: absolute; z-index: 1000; height: 18px; aspect-ratio: 220.86 / 43.92;`,
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
