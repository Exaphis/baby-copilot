import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { DiffRange, SvgCodeRenderer, dmpDiff } from "@baby-copilot/core";
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
const INLINE_REMOVE_DECORATION_TYPE =
  vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("diffEditor.removedTextBackground"),
    borderColor: new vscode.ThemeColor("diffEditor.removedTextBorder"),
  });

// Decoration for empty line removals with hatched/slashed background
const INLINE_REMOVE_EMPTY_LINE_DECORATION_TYPE =
  vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("diffEditor.removedTextBackground"),
    borderColor: new vscode.ThemeColor("diffEditor.removedTextBorder"),
  });

class NesHandler {
  editor: vscode.TextEditor;
  cts: vscode.CancellationTokenSource;
  diffData: {
    customDecorationTypes: vscode.TextEditorDecorationType[];
    range: vscode.Range;
    newContent: string;
  } | null = null;

  // TODO: destruct?
  constructor(editor: vscode.TextEditor) {
    this.editor = editor;
    this.cts = new vscode.CancellationTokenSource();
  }

  async trigger() {
    // Remove existing diff data
    this.diffData?.customDecorationTypes.forEach((x) => x.dispose());
    this.editor.setDecorations(INLINE_REMOVE_DECORATION_TYPE, []);
    this.editor.setDecorations(INLINE_REMOVE_EMPTY_LINE_DECORATION_TYPE, []);
    this.diffData = null;

    const document = this.editor.document;
    const position = this.editor.selection.active;
    // pass a URI so VS Code can apply folder- or language-specific
    // overrides when they exist
    const uri = this.editor.document.uri;
    const editorCfg = vscode.workspace.getConfiguration("editor", uri);

    const fontFamily = editorCfg.get<string>("fontFamily") || " monospace";
    const fontSize = editorCfg.get<number>("fontSize") || 14;
    const tabSize =
      typeof this.editor.options.tabSize === "number"
        ? this.editor.options.tabSize
        : editorCfg.get<number>("tabSize", 4);
    const lineHeight = getEffectiveLineHeight(editorCfg);

    const rangeForSnippet = document.validateRange(
      new vscode.Range(
        Math.max(position.line - 10, 0),
        0,
        position.line + 10,
        0
      )
    );

    const language = document.languageId;
    const snippet = document.getText(rangeForSnippet);
    const nesEdit = await nesUtils.requestEdit(
      {
        doc: document,
        diffTrajectory: [],
        cursor: position,
        editableRange: rangeForSnippet,
      },
      this.cts.token
    );

    if (nesEdit === null) {
      return;
    }

    // --- Render ---
    const diff = dmpDiff(snippet, nesEdit.content);

    // Helper to translate DiffRange coordinates to document coordinates
    const toDocumentRanges = (ranges: DiffRange[]): vscode.Range[] => {
      return ranges.map(
        (dr) =>
          new vscode.Range(
            rangeForSnippet.start.line + dr.start.line,
            dr.start.character,
            rangeForSnippet.start.line + dr.end.line,
            dr.end.character
          )
      );
    };

    // Helper to extract text from a DiffRange within a given content string
    const getTextInRange = (text: string, range: DiffRange): string => {
      const lines = text.split(/\r\n|\r|\n/);

      if (range.start.line === range.end.line) {
        return lines[range.start.line].substring(
          range.start.character,
          range.end.character
        );
      }

      const result: string[] = [
        lines[range.start.line].substring(range.start.character),
        ...lines.slice(range.start.line + 1, range.end.line),
        lines[range.end.line].substring(0, range.end.character),
      ];

      return result.join("\n");
    };

    // Helper to split removal ranges into text and empty-line decorations
    const applyRemovalDecorations = (ranges: vscode.Range[]) => {
      const emptyLineRanges: vscode.Range[] = [];

      for (const range of ranges) {
        // Check each fully-covered line within this removal range
        const firstFullLine =
          range.start.character === 0 ? range.start.line : range.start.line + 1;

        for (let line = firstFullLine; line <= range.end.line; line++) {
          const lineRange = document.lineAt(line).range;
          // If this line is fully within the removal and is empty, track it
          if (
            range.contains(lineRange) &&
            document.lineAt(line).isEmptyOrWhitespace
          ) {
            emptyLineRanges.push(lineRange);
          }
        }
      }

      this.editor.setDecorations(INLINE_REMOVE_DECORATION_TYPE, ranges);
      this.editor.setDecorations(
        INLINE_REMOVE_EMPTY_LINE_DECORATION_TYPE,
        emptyLineRanges
      );
    };

    let customDecorationTypes = [];
    if (diff.left.length === 0 && diff.right.length === 0) {
      // Base case: nothing
    } else if (diff.left.length > 0 && diff.right.length === 0) {
      // Case 1: all deletions
      applyRemovalDecorations(toDocumentRanges(diff.left));
    } else if (diff.left.length === 0 && diff.right.length > 0) {
      // Case 2: all additions - render as ghost text
      const documentRanges = toDocumentRanges(diff.right);

      // Map each addition range back to its position in the original document
      // by subtracting the accumulated content that was added before it
      let accumulatedLines = 0;
      let accumulatedChars = 0;
      let currentLine = -1;

      for (let i = 0; i < diff.right.length; i++) {
        const originalRange = documentRanges[i];

        // Reset char accumulation when moving to a new line
        if (originalRange.start.line !== currentLine) {
          currentLine = originalRange.start.line;
          accumulatedChars = 0;
        }

        const ghostPosition = new vscode.Position(
          originalRange.start.line - accumulatedLines,
          originalRange.start.character - accumulatedChars
        );

        const ghostText = getTextInRange(nesEdit.content, diff.right[i]);

        // If ghost text is entirely whitespace, make it visible with middle dots
        let displayText = ghostText;
        if (ghostText.trim().length === 0 && ghostText.length > 0) {
          const tabSize = (this.editor.options.tabSize as number) ?? 4;
          displayText = ghostText
            .replace(/\t/g, '·'.repeat(tabSize))
            .replace(/ /g, '·');
        }

        const ghostTextDecorationType =
          vscode.window.createTextEditorDecorationType({
            after: {
              contentText: displayText,
              color: new vscode.ThemeColor("editorGhostText.foreground"),
              backgroundColor: new vscode.ThemeColor(
                "editorGhostText.background"
              ),
              borderColor: new vscode.ThemeColor("editorGhostText.border"),
            },
          });

        this.editor.setDecorations(ghostTextDecorationType, [
          new vscode.Range(ghostPosition, ghostPosition),
        ]);

        // Update offsets for next iteration
        const rangeSpan = {
          lines: originalRange.end.line - originalRange.start.line,
          chars: originalRange.isSingleLine
            ? originalRange.end.character - originalRange.start.character
            : originalRange.end.character,
        };
        accumulatedLines += rangeSpan.lines;
        if (rangeSpan.lines > 0) {
          // Multi-line addition: reset to end character position and update current line
          accumulatedChars = rangeSpan.chars;
          currentLine = originalRange.end.line;
        } else {
          // Same-line addition: accumulate characters
          accumulatedChars += rangeSpan.chars;
        }

        customDecorationTypes.push(ghostTextDecorationType);
      }
    } else if (diff.left.length > 0 && diff.right.length > 0) {
      // Case 3: mixed - show removals inline and additions in overlay
      applyRemovalDecorations(toDocumentRanges(diff.left));

      const cr = SvgCodeRenderer.getInstance();
      const lines = nesEdit.content.split(/\r\n|\r|\n/);
      const numLines = lines.length;

      // Determine width based on longest line length.
      // We do this instead of using overflow: hidden because for unknown reasons
      // it cuts off long lines at the start instead of at the end sometimes?
      // e.g., a long comment will get cut off completely
      const maxSuggestedWidth = lines.reduce((max, l) => {
        const visual = l.replace(/\t/g, " ".repeat(tabSize));
        return Math.max(max, visual.length);
      }, 0);
      const maxExistingWidth = snippet.split(/\r\n|\r|\n/).reduce((max, l) => {
        const visual = l.replace(/\t/g, " ".repeat(tabSize));
        return Math.max(max, visual.length);
      }, 0);

      const nesDimensions = {
        // fontSize is not the width, but should be safe because it is larger
        width: maxSuggestedWidth * fontSize,
        height: numLines * lineHeight,
      };

      // Use built-in diff rendering
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
        diff.right
      );

      const diffSvgDecorationType =
        vscode.window.createTextEditorDecorationType({
          isWholeLine: true,
          rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
          before: {
            width: `${nesDimensions.width}px`,
            height: `${nesDimensions.height}px`,
            textDecoration: `; position: absolute; margin-left: ${
              maxExistingWidth + 5
            }ch; z-index: 1000;`,
            contentIconPath: vscode.Uri.parse(svgData),
          },
        });
      this.editor.setDecorations(diffSvgDecorationType, [rangeForSnippet]);
      customDecorationTypes.push(diffSvgDecorationType);
    }

    this.diffData = {
      customDecorationTypes: customDecorationTypes,
      range: rangeForSnippet,
      newContent: nesEdit.content,
    };

    // Set context to enable Tab/Escape keybindings
    vscode.commands.executeCommand(
      "setContext",
      "baby-copilot.hasSuggestion",
      true
    );
  }

  reset() {
    this.diffData?.customDecorationTypes.forEach((x) => x.dispose());
    this.diffData = null;
    this.editor.setDecorations(INLINE_REMOVE_DECORATION_TYPE, []);
    this.editor.setDecorations(INLINE_REMOVE_EMPTY_LINE_DECORATION_TYPE, []);

    // Clear context to disable Tab/Escape keybindings
    vscode.commands.executeCommand(
      "setContext",
      "baby-copilot.hasSuggestion",
      false
    );
  }

  accept() {
    if (!this.diffData) {
      return;
    }

    this.editor.edit((editBuilder) => {
      editBuilder.replace(this.diffData!.range, this.diffData!.newContent);
    });

    // Clear the suggestion after accepting
    this.reset();
  }
}

const handlers = new WeakMap<vscode.TextEditor, NesHandler>();

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  extContext = context;
  // Initialize inline completion support for addition-only edits
  nesUtils.initInlineCompletionProvider(context);

  const cr = SvgCodeRenderer.getInstance();
  await cr.setTheme("dark-plus");

  const disposable = vscode.commands.registerCommand(
    "baby-copilot.triggerSuggestion",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      if (!handlers.has(editor)) {
        handlers.set(editor, new NesHandler(editor));
      }
      const handler = handlers.get(editor)!;
      await handler.trigger();

      vscode.window.showInformationMessage(
        "baby-copilot: Triggered suggestion"
      );
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

  const acceptSuggestionCommand = vscode.commands.registerCommand(
    "baby-copilot.acceptSuggestion",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      handlers.get(editor)?.accept();
    }
  );

  const cancelSuggestionCommand = vscode.commands.registerCommand(
    "baby-copilot.cancelSuggestion",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      handlers.get(editor)?.reset();
    }
  );

  // Auto-cancel suggestions on document changes
  const onDocumentChange = vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
      handlers.get(editor)?.reset();
    }
  });

  // Auto-cancel suggestions on cursor movement
  const onSelectionChange = vscode.window.onDidChangeTextEditorSelection(
    (event) => {
      handlers.get(event.textEditor)?.reset();
    }
  );

  // Auto-cancel suggestions on tab switch
  const onEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      handlers.get(editor)?.reset();
    }
  });

  context.subscriptions.push(
    disposable,
    viewLogsCommand,
    acceptSuggestionCommand,
    cancelSuggestionCommand,
    onDocumentChange,
    onSelectionChange,
    onEditorChange
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}

export function getExtensionContext() {
  return extContext;
}
