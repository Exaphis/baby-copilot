import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CodeRenderer } from "./codeRenderer.js";
import * as nesUtils from "./nesUtils.js";

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

interface NesSuggestionResult {
  nesDecorationType: vscode.TextEditorDecorationType;
  range: vscode.Range;
}

interface CmsSuggestionResult {
  cmsDecorationType: vscode.TextEditorDecorationType;
  range: vscode.Range;
}

interface SuggestionResult {
  nesResult: NesSuggestionResult | null;
  cmsResult: CmsSuggestionResult | null;
}

let suggestCts: vscode.CancellationTokenSource | null = null;

async function triggerSuggestions() {
  // Cancel any in-flight request
  suggestCts?.cancel();
  suggestCts?.dispose();

  nesDecorationType?.dispose();
  cmsDecorationType?.dispose();

  const localCts = new vscode.CancellationTokenSource();
  suggestCts = localCts;
  const result = await requestSuggestions(localCts.token);
  if (!result || localCts.token.isCancellationRequested) {
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
      const cursorDecorations: vscode.DecorationOptions[] = [];
      cursorDecorations.push({ range: cmsResult.range });
      activeEditor.setDecorations(cmsDecorationType, cursorDecorations);
    }
  }
}

async function requestSuggestions(
  token: vscode.CancellationToken
): Promise<SuggestionResult | null> {
  if (token.isCancellationRequested) {
    return null;
  }

  let activeEditor = vscode.window.activeTextEditor;
  if (activeEditor === undefined || token.isCancellationRequested) {
    return null;
  }

  const document = activeEditor.document;
  const position = activeEditor.selection.active;

  const uri = vscode.window.activeTextEditor?.document.uri; // pass a URI so VS Code can
  // apply folder- or language-specific
  // overrides when they exist
  const editorCfg = vscode.workspace.getConfiguration("editor", uri);

  const fontFamily = editorCfg.get<string>("fontFamily") || " monospace";
  const fontSize = editorCfg.get<number>("fontSize") || 14;
  const lineHeight = getEffectiveLineHeight(editorCfg);

  const rangeForSnippet = document.validateRange(
    new vscode.Range(Math.max(position.line - 5, 0), 0, position.line + 5, 0)
  );

  // Next Edit Suggestions
  const language = document.languageId;
  const snippet = document.getText(rangeForSnippet);
  const nesEdit = await nesUtils.requestEdit(
    {
      doc: document,
      diffTrajectory: [],
      cursor: position,
      editableRange: rangeForSnippet,
    },
    token
  );

  async function getNesResult(): Promise<NesSuggestionResult | null> {
    if (nesEdit === null) {
      return null;
    }

    const cr = CodeRenderer.getInstance();
    const nesDimensions = {
      width: 240,
      height:
        // TODO: nes dimensions shouold be based on the number of lines in the diff output
        (rangeForSnippet.end.line - rangeForSnippet.start.line + 1) *
        lineHeight,
    };
    const svgData = await cr.getDataUri(
      nesEdit.content,
      language,
      {
        imageType: "svg",
        fontFamily,
        fontSize,
        lineHeight,
        dimensions: nesDimensions,
      },
      []
    );

    const newNesDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      before: {
        width: `${nesDimensions.width}px`,
        height: `${nesDimensions.height}px`,
        textDecoration:
          "; position: absolute; margin-left: 30ch; z-index: 1000;",
        contentIconPath: vscode.Uri.parse(svgData),
      },
    });

    return {
      nesDecorationType: newNesDecorationType,
      range: rangeForSnippet,
    };
  }

  async function getCmsResult(): Promise<CmsSuggestionResult | null> {
    // cursor movement
    const cmsSvgPath = path.join(
      extContext.extensionPath,
      "src",
      "cursorSuggestion.svg"
    );
    const cmsSvgData = fs.readFileSync(cmsSvgPath, "utf8");
    const contentIconBase64 =
      "data:image/svg+xml;base64," + Buffer.from(cmsSvgData).toString("base64");

    const newCmsDecorationType = vscode.window.createTextEditorDecorationType({
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      after: {
        // TODO: it doesn't show up if we don't set aspect-ratio... why?
        textDecoration: `; position: absolute; z-index: 1000; height: ${lineHeight}px; aspect-ratio: 220.86 / 43.92;`,
        contentIconPath: vscode.Uri.parse(contentIconBase64),
      },
    });
    const cursorRange = new vscode.Range(
      position.line + 1,
      0,
      position.line + 1,
      0
    );

    return {
      cmsDecorationType: newCmsDecorationType,
      range: cursorRange,
    };
  }

  return {
    nesResult: await getNesResult(),
    cmsResult: await getCmsResult(),
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
