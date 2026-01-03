const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt } = require("../dist/index.js");

describe("nextEdit prompt builder", () => {
  it("builds prompt with context, diffs, and editable markers", () => {
    const result = buildPrompt({
      snapshot: {
        path: "/repo/file.ts",
        text: "const value = 1;\nconsole.log(value);\n",
        editableRange: { startOffset: 0, endOffset: 22 },
      },
      diffs: [
        { path: "/repo/file.ts", diff: "@@ -1 +1 @@\n-const value\n+const value\n" },
      ],
      definitions: [
        {
          path: "/repo/defs.ts",
          content: "export const value = 1;\n",
        },
      ],
    });

    assert.match(result.contextBlock, /Definition from "\/repo\/defs\.ts"/);
    assert.match(result.diffTrace, /User edited file "\/repo\/file\.ts"/);
    assert.match(result.userPrompt, /### Context:/);
    assert.match(result.userPrompt, /### User Edits:/);
    assert.match(result.userPrompt, /### User Excerpt:/);
    assert.match(result.userPrompt, /<\|editable_region_start\|>/);
    assert.match(result.userPrompt, /<\|editable_region_end\|>/);
  });
});
