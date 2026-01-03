import * as vscode from "vscode";
import type { DefinitionSnippet } from "@baby-copilot/core/nextEdit";

const maxDefinitionSnippets = 5;
const definitionContextLines = 5;
const maxDefinitionRequests = 20;

export async function collectDefinitionSnippets(
  doc: vscode.TextDocument,
  editableRange: vscode.Range,
  cursor: vscode.Position,
  token: vscode.CancellationToken
): Promise<DefinitionSnippet[]> {
  if (token.isCancellationRequested) {
    return [];
  }

  const definitionTargets = new Map<
    string,
    { uri: vscode.Uri; range: vscode.Range }
  >();

  try {
    const semanticTokens = await vscode.commands.executeCommand<
      vscode.SemanticTokens | null | undefined
    >(
      "vscode.provideDocumentRangeSemanticTokens",
      doc.uri,
      editableRange
    );
    const positions = semanticTokens?.data?.length
      ? decodeSemanticTokenPositions(editableRange, semanticTokens.data)
      : [];
    console.log(
      `baby-copilot: semantic tokens=${semanticTokens?.data?.length ?? 0}, positions=${positions.length}`
    );

    const uniquePositions = new Map<string, vscode.Position>();
    for (const position of positions) {
      const key = `${position.line}:${position.character}`;
      if (!uniquePositions.has(key)) {
        uniquePositions.set(key, position);
      }
    }

    const requestPositions = Array.from(uniquePositions.values()).slice(
      0,
      maxDefinitionRequests
    );
    if (requestPositions.length === 0) {
      requestPositions.push(cursor);
    }

    let definitionCount = 0;
    for (const position of requestPositions) {
      if (token.isCancellationRequested) {
        break;
      }
      if (definitionTargets.size >= maxDefinitionSnippets) {
        break;
      }
      const definitions = await vscode.commands.executeCommand<
        (vscode.Location | vscode.LocationLink)[]
      >("vscode.executeDefinitionProvider", doc.uri, position);
      definitionCount += definitions?.length ?? 0;
      if (!definitions?.length) {
        continue;
      }
      for (const def of definitions) {
        const normalized =
          "targetUri" in def
            ? { uri: def.targetUri, range: def.targetRange }
            : { uri: def.uri, range: def.range };
        const key = `${normalized.uri.toString()}::${normalized.range.start.line}:${normalized.range.start.character}-${normalized.range.end.line}:${normalized.range.end.character}`;
        if (!definitionTargets.has(key)) {
          definitionTargets.set(key, normalized);
        }
      }
    }
    console.log(
      `baby-copilot: definition requests=${requestPositions.length}, results=${definitionCount}, unique=${definitionTargets.size}`
    );
  } catch (error) {
    console.warn("Failed to collect definition context", error);
  }

  const snippets: DefinitionSnippet[] = [];
  for (const def of definitionTargets.values()) {
    if (snippets.length >= maxDefinitionSnippets) {
      break;
    }
    if (token.isCancellationRequested) {
      break;
    }
    const targetDoc = await vscode.workspace.openTextDocument(def.uri);
    const snippetRange = expandRangeByLines(
      targetDoc,
      def.range,
      definitionContextLines
    );
    const snippet = targetDoc.getText(snippetRange);
    snippets.push({
      path: targetDoc.uri.fsPath || targetDoc.uri.toString(),
      content: snippet,
    });
  }
  if (snippets.length > 0) {
    console.log(`baby-copilot: definition snippets=${snippets.length}`);
  }

  return snippets;
}

function expandRangeByLines(
  doc: vscode.TextDocument,
  range: vscode.Range,
  linePadding: number
): vscode.Range {
  const startLine = Math.max(range.start.line - linePadding, 0);
  const endLine = Math.min(
    range.end.line + linePadding,
    doc.lineCount - 1
  );
  const start = new vscode.Position(startLine, 0);
  const end = new vscode.Position(endLine, doc.lineAt(endLine).text.length);
  return new vscode.Range(start, end);
}

function decodeSemanticTokenPositions(
  range: vscode.Range,
  data: Uint32Array
): vscode.Position[] {
  const positions: vscode.Position[] = [];
  let currentLineOffset = 0;
  let currentChar = range.start.character;

  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    const length = data[i + 2];
    if (deltaLine === 0) {
      currentChar += deltaStart;
    } else {
      currentLineOffset += deltaLine;
      currentChar = deltaStart;
    }
    if (length === 0) {
      continue;
    }
    const line = range.start.line + currentLineOffset;
    positions.push(new vscode.Position(line, currentChar));
  }

  return positions;
}
