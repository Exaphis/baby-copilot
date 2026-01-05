import * as vscode from "vscode";
import { generateText, ModelMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { buildPrompt, type DiffEntry } from "@baby-copilot/core";
import { collectDefinitionSnippets } from "./adapter/vscodeContext.js";

export interface NesContext {
  doc: vscode.TextDocument; // document being edited
  diffTrajectory: DiffEntry[]; // trajectory of diffs, newest to oldest
  cursor: vscode.Position; // cursor position in the file
  editableRange: vscode.Range; // range that can be edited
}

export interface NesSuggestion {
  content: string; // new contents of the editable range
}

const gateway = createOpenAICompatible({
  name: "openai",
  baseURL: "http://localhost:1234/v1",
});

export async function requestEdit(
  context: NesContext,
  token: vscode.CancellationToken
): Promise<NesSuggestion | null> {
  if (token.isCancellationRequested) {
    return null;
  }

  const full = context.doc.getText();
  const start = context.doc.offsetAt(context.editableRange.start);
  const end = context.doc.offsetAt(context.editableRange.end);
  const path = context.doc.uri.fsPath;
  const definitions = await collectDefinitionSnippets(
    context.doc,
    context.editableRange,
    context.cursor,
    token
  );
  const { systemPrompt, userPrompt, contextBlock, diffTrace } = buildPrompt({
    snapshot: {
      path,
      text: full,
      editableRange: { startOffset: start, endOffset: end },
    },
    diffs: context.diffTrajectory,
    definitions,
  });
  const diffLines = diffTrace.split("\n");
  const firstHunkIndex = diffLines.findIndex((line) => line.startsWith("@@"));
  const cleanedDiffTrace =
    firstHunkIndex === -1 ? "" : diffLines.slice(firstHunkIndex).join("\n");
  console.log(
    `baby-copilot: context bytes=${contextBlock.length}, diffs=${context.diffTrajectory.length}`
  );
  console.log(`baby-copilot: diff trajectory\n${cleanedDiffTrace}`);

  const prompt: ModelMessage[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];

  try {
    const resp = await generateText({
      model: gateway("instinct"),
      prompt: prompt,
    });

    console.log(JSON.stringify(prompt));
    console.log(resp);

    return { content: resp.text };
  } catch (error) {
    console.error("Failed to generate inline edit", error);
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while requesting edit.";
    vscode.window.showErrorMessage(`baby-copilot: request failed (${message})`);
    return null;
  }
}

export async function requestProbe(
  token: vscode.CancellationToken
): Promise<boolean> {
  if (token.isCancellationRequested) {
    return false;
  }

  const prompt: ModelMessage[] = [
    {
      role: "system",
      content: "You are a latency probe. Reply with a single word: OK.",
    },
    {
      role: "user",
      content: "Ping.",
    },
  ];

  try {
    await generateText({
      model: gateway("instinct"),
      prompt: prompt,
    });
    return true;
  } catch (error) {
    console.error("Failed to run latency probe", error);
    return false;
  }
}
