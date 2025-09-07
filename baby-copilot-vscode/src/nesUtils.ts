import * as vscode from "vscode";

export interface Diff {
  path: string; // path to the file
  diff: string; // diff in unified format
}

export interface NesContext {
  doc: vscode.TextDocument; // document being edited
  diffTrajectory: Diff[]; // trajectory of diffs
  cursor: vscode.Position; // cursor position in the file
  editableRange: vscode.Range; // range that can be edited
}

export interface NesSuggestion {
  content: string; // new contents of the editable range
}

export async function requestEdit(
  context: NesContext,
  token: vscode.CancellationToken
): Promise<NesSuggestion | null> {
  try {
    if (token.isCancellationRequested) {
      return null;
    }

    // Build prompt content
    const systemPrompt = SYSTEM_PROMPT;
    const userMessage = buildUserMessage(context);

    const model = "llama-3.3-70b";
    const url = "http://localhost:8000/v1/chat/completions";
    const temperature = 0.2;
    const maxTokens = 800;

    // Wire cancellation
    const controller = new AbortController();
    const onCancel = () => controller.abort();
    token.onCancellationRequested(onCancel);

    try {
      const reqStart = Date.now();
      const requestBody: any = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature,
        max_completion_tokens: maxTokens,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const elapsed = Date.now() - reqStart;
        const errText = await safeText(resp);
        console.error(
          `Chat API error ${resp.status}: ${resp.statusText} (after ${elapsed}ms)\n${errText}`
        );
        return null;
      }

      const data = (await resp.json()) as any;
      const content: string | undefined =
        data?.choices?.[0]?.message?.content ?? undefined;
      if (!content || typeof content !== "string") {
        const elapsed = Date.now() - reqStart;
        console.warn("Chat API returned empty content");
        console.warn(
          `requestEdit latency (empty): ${elapsed}ms; model=${model}`
        );
        return null;
      }
      const extracted = extractEditedRegion(content);
      if (!extracted) {
        const elapsed = Date.now() - reqStart;
        console.warn("No <edited_region> tag found in response.");
        console.warn(
          `requestEdit latency (no-tag): ${elapsed}ms; model=${model}`
        );
        console.warn(`Got:\n${content}`);
        return null;
      }
      const elapsed = Date.now() - reqStart;
      const usage = data?.usage;
      const usageStr = usage
        ? `; tokens total=${usage.total_tokens ?? "?"}, prompt=${
            usage.prompt_tokens ?? "?"
          }, completion=${usage.completion_tokens ?? "?"}`
        : "";
      console.log(
        `requestEdit latency: ${elapsed}ms; model=${model}${usageStr}`
      );
      return { content: extracted };
    } finally {
      // best-effort cleanup for the cancellation handler
      token.onCancellationRequested(() => {});
    }
  } catch (err) {
    console.error("requestEdit failed:", err);
    return null;
  }
}

const SYSTEM_PROMPT = `You are Instinct, an intelligent next-edit predictor. Your role as an AI agent is to help developers complete their code tasks by predicting the next edit that they will make within the section of code marked by <|editable_region_start|> and <|editable_region_end|> tags.

You have access to the following information to help you make informed suggestions:

- Context: In the section marked "### Context", there are context items from potentially relevant files in the developer's codebase. Each context item consists of a <|context_file|> marker, the filepath, a <|snippet|> marker, and then some content from that file, in that order. Keep in mind that not all of the context information may be relevant to the task, so use your judgement to determine which parts to consider.
- User Edits: In the section marked "### User Edits:", there is a record of the most recent changes made to the code, helping you understand the evolution of the code and the developer's intentions. These changes are listed from most recent to least recent. It's possible that some of the edit diff history is entirely irrelevant to the developer's change. The changes are provided in a unified line-diff format, i.e. with pluses and minuses for additions and deletions to the code.
- User Excerpt: In the section marked "### User Excerpt:", there is a filepath to the developer's current file, and then an excerpt from that file. The <|editable_region_start|> and <|editable_region_end|> markers are within this excerpt. Your job is to rewrite only this editable region, not the whole excerpt. The excerpt provides additional context on the surroundings of the developer's edit.
- Cursor Position: Within the user excerpt's editable region, the <|user_cursor_is_here|> flag indicates where the developer's cursor is currently located, which can be crucial for understanding what part of the code they are focusing on. Do not produce this marker in your output; simply take it into account.

Your task is to predict and complete the changes the developer would have made next in the editable region. The developer may have stopped in the middle of typing. Your goal is to keep the developer on the path that you think they're following. Some examples include further implementing a class, method, or variable, or improving the quality of the code. Make sure the developer doesn't get distracted by ensuring your suggestion is relevant. Consider what changes need to be made next, if any. If you think changes should be made, ask yourself if this is truly what needs to happen. If you are confident about it, then proceed with the changes.

# Steps

1. **Review Context**: Analyze the context from the resources provided, such as recently viewed snippets, edit history, surrounding code, and cursor location.
2. **Evaluate Current Code**: Determine if the current code within the tags requires any corrections or enhancements.
3. **Suggest Edits**: If changes are required, ensure they align with the developer's patterns and improve code quality.
4. **Maintain Consistency**: Ensure indentation and formatting follow the existing code style.

# Output Format

- Provide only the revised code within the tags. Do not include the tags in your output.
- Ensure that you do not output duplicate code that exists outside of these tags.
- Avoid undoing or reverting the developer's last change unless there are obvious typos or errors.
- Output the modified editable region in a single <edited_region> tag.
`;

function buildUserMessage(context: NesContext): string {
  const doc = context.doc;
  const filePath = doc.uri.fsPath;
  const language = doc.languageId || "";

  // Build excerpt within editable range with markers and cursor indicator
  const excerpt = doc.getText(context.editableRange);
  const cursorOffset =
    doc.offsetAt(context.cursor) - doc.offsetAt(context.editableRange.start);
  const safeCursorOffset = Math.max(0, Math.min(excerpt.length, cursorOffset));
  const excerptWithCursor =
    excerpt.slice(0, safeCursorOffset) +
    "<|user_cursor_is_here|>" +
    excerpt.slice(safeCursorOffset);

  const markedExcerpt =
    "```" +
    language +
    "\n" +
    // Provide some minimal surrounding context: we already limit the range in caller
    "<|editable_region_start|>\n" +
    excerptWithCursor +
    "\n<|editable_region_end|>\n" +
    "```";

  // Build User Edits from diff trajectory (most recent first)
  const editsText = (context.diffTrajectory || [])
    .map((d) => `--- a/${d.path}\n+++ b/${d.path}\n${d.diff}`)
    .join("\n\n");

  // Minimal Context section; future: include more files/snippets
  const contextSection = ""; // None for now

  const headerInstruction =
    "Reference the user excerpt, user edits, and the snippets to understand the developer's intent. " +
    "Update the editable region of the user excerpt by predicting and completing the changes they would have made next. " +
    "This may be a deletion, addition, or modification of code.";

  return [
    headerInstruction,
    "",
    "#### Context",
    contextSection || "",
    "",
    "### User Edits:",
    editsText || "",
    "",
    "### User Excerpt:",
    `Filepath: ${filePath}`,
    markedExcerpt,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function safeText(resp: any): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

function extractEditedRegion(text: string): string | null {
  try {
    const match = text.match(
      /<edited_region\b[^>]*>([\s\S]*?)<\/edited_region>/i
    );
    if (!match) {
      return null;
    }
    let inner = match[1];
    // Trim outer whitespace
    inner = inner.trim();
    // If the entire inner is fenced in a Markdown code block, strip it.
    // Handles ``` or ```lang fences.
    if (/^```/.test(inner) && /```\s*$/.test(inner)) {
      inner = inner.replace(/^```[a-zA-Z0-9_-]*\s*/i, "");
      inner = inner.replace(/\s*```\s*$/i, "");
      inner = inner.replace(/^\n+|\n+$/g, "");
    }
    return inner;
  } catch (e) {
    console.warn("Failed to parse <edited_region> from response:", e);
    return null;
  }
}
