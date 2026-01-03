import type { DefinitionSnippet } from "./types.js";

export function formatDefinitionSnippets(
  snippets: DefinitionSnippet[]
): string {
  if (!snippets.length) {
    return "";
  }

  return snippets
    .map((snippet) => `Definition from "${snippet.path}"\n\n${snippet.content}`)
    .join("\n\n");
}
