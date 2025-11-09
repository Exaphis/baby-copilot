import { diff_match_patch, Diff } from "diff-match-patch";

export type DiffType = "added" | "removed";

export interface Position {
  line: number;
  character: number;
}

export interface DiffRange {
  start: Position;
  end: Position;
  type: DiffType;
}

export interface SideBySideDiffRanges {
  left: DiffRange[];
  right: DiffRange[];
}

function clonePosition(pos: Position): Position {
  return { line: pos.line, character: pos.character };
}

function advancePosition(pos: Position, text: string): Position {
  if (text.length === 0) {
    return { line: pos.line, character: pos.character };
  }

  let line = pos.line;
  let character = pos.character;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x0d /* \r */) {
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 0x0a /* \n */) {
        i += 1;
      }
      line += 1;
      character = 0;
      continue;
    }
    if (code === 0x0a /* \n */) {
      line += 1;
      character = 0;
      continue;
    }
    character += 1;
  }

  return { line, character };
}

function collectSideBySideRanges(diffs: Diff[]): SideBySideDiffRanges {
  const leftRanges: DiffRange[] = [];
  const rightRanges: DiffRange[] = [];

  let leftPos: Position = { line: 0, character: 0 };
  let rightPos: Position = { line: 0, character: 0 };

  for (const [op, text] of diffs) {
    if (op === diff_match_patch.DIFF_EQUAL) {
      leftPos = advancePosition(leftPos, text);
      rightPos = advancePosition(rightPos, text);
      continue;
    }

    if (op === diff_match_patch.DIFF_DELETE) {
      const start = clonePosition(leftPos);
      const end = advancePosition(leftPos, text);
      if (text.length > 0) {
        leftRanges.push({
          start,
          end,
          type: "removed",
        });
      }
      leftPos = end;
      continue;
    }

    if (op === diff_match_patch.DIFF_INSERT) {
      const start = clonePosition(rightPos);
      const end = advancePosition(rightPos, text);
      if (text.length > 0) {
        rightRanges.push({
          start,
          end,
          type: "added",
        });
      }
      rightPos = end;
    }
  }

  return { left: leftRanges, right: rightRanges };
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === 0x0d /* \r */) {
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 0x0a /* \n */) {
        i += 2;
      } else {
        i += 1;
      }
      starts.push(i);
      continue;
    }
    if (code === 0x0a /* \n */) {
      i += 1;
      starts.push(i);
      continue;
    }
    i += 1;
  }
  return starts;
}

function positionToOffset(pos: Position, lineStarts: number[]): number {
  const lineStart =
    lineStarts[pos.line] ?? lineStarts[lineStarts.length - 1] ?? 0;
  return lineStart + pos.character;
}

function comparePositions(a: Position, b: Position): number {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.character - b.character;
}

const ANSI_RESET = "\x1b[0m";
const ANSI_HIGHLIGHT: Record<DiffType, string> = {
  added: "\x1b[102m\x1b[30m",
  removed: "\x1b[101m\x1b[30m",
};

function getTerminalColumns(): number {
  if (
    typeof process !== "undefined" &&
    process.stdout &&
    typeof process.stdout.columns === "number"
  ) {
    return process.stdout.columns;
  }
  return 80;
}

function stringDisplayWidth(str: string): number {
  return [...str].length;
}

export function highlightText(text: string, ranges: DiffRange[]): string {
  if (ranges.length === 0) {
    return text;
  }

  const lineStarts = computeLineStarts(text);
  const segments = ranges
    .slice()
    .sort((a, b) => comparePositions(a.start, b.start))
    .map((range) => ({
      start: positionToOffset(range.start, lineStarts),
      end: positionToOffset(range.end, lineStarts),
      type: range.type,
    }))
    .filter((segment) => segment.end > segment.start);

  let out = "";
  let segmentIndex = 0;

  for (let lineIdx = 0; lineIdx < lineStarts.length; lineIdx += 1) {
    const lineStart = lineStarts[lineIdx];
    const lineEnd =
      lineIdx + 1 < lineStarts.length ? lineStarts[lineIdx + 1] : text.length;
    const lineText = text.slice(lineStart, lineEnd);
    const newlineMatch = lineText.match(/(\r\n|\r|\n)$/);
    const lineEnding = newlineMatch ? newlineMatch[0] : "";
    const lineContent = newlineMatch
      ? lineText.slice(0, -lineEnding.length)
      : lineText;

    while (
      segmentIndex < segments.length &&
      segments[segmentIndex].end <= lineStart
    ) {
      segmentIndex += 1;
    }

    let cursor = segmentIndex;
    const lineSegments: Array<{ start: number; end: number; type: DiffType }> =
      [];

    while (cursor < segments.length && segments[cursor].start < lineEnd) {
      const segment = segments[cursor];
      const clipStart = Math.max(segment.start, lineStart);
      const clipEnd = Math.min(segment.end, lineEnd);
      if (clipEnd > clipStart) {
        lineSegments.push({
          start: clipStart - lineStart,
          end: clipEnd - lineStart,
          type: segment.type,
        });
      }
      if (segment.end <= lineEnd) {
        cursor += 1;
      } else {
        segments[cursor] = { ...segment, start: clipEnd };
        break;
      }
    }
    segmentIndex = cursor;

    if (lineSegments.length === 0) {
      out += lineText;
      continue;
    }

    lineSegments.sort((a, b) => a.start - b.start);

    const fullLineSegment = lineSegments.find(
      (segment) => segment.start <= 0 && segment.end >= lineText.length
    );

    if (fullLineSegment) {
      const color = ANSI_HIGHLIGHT[fullLineSegment.type];
      const columns = getTerminalColumns();
      const visibleWidth = stringDisplayWidth(lineContent);
      const padding =
        visibleWidth < columns ? " ".repeat(columns - visibleWidth) : "";
      out += `${color}${lineContent}${padding}${ANSI_RESET}${lineEnding}`;
      continue;
    }

    let lineOut = "";
    let relCursor = 0;
    for (const segment of lineSegments) {
      const start = Math.min(segment.start, lineContent.length);
      const end = Math.min(segment.end, lineContent.length);
      if (start > relCursor) {
        lineOut += lineContent.slice(relCursor, start);
      }
      if (end > start) {
        const color = ANSI_HIGHLIGHT[segment.type];
        lineOut += `${color}${lineContent.slice(start, end)}${ANSI_RESET}`;
      }
      relCursor = Math.max(relCursor, end);
    }
    if (relCursor < lineContent.length) {
      lineOut += lineContent.slice(relCursor);
    }

    out += lineOut + lineEnding;
  }

  return out;
}

export function dmpDiff(left: string, right: string): SideBySideDiffRanges {
  /**
   * Render a diff by generating left and right ranges.
   * Left side is highlighted with deletions and right side is highlighted with additions.
   */
  const differ = new diff_match_patch();
  const diffs = differ.diff_main(left, right);
  differ.diff_cleanupSemantic(diffs);
  return collectSideBySideRanges(diffs);
}

function isRunningDirectly(): boolean {
  if (
    typeof process === "undefined" ||
    typeof process.argv === "undefined" ||
    process.argv.length <= 1 ||
    typeof import.meta === "undefined" ||
    typeof import.meta.url !== "string"
  ) {
    return false;
  }

  const modulePath = decodeURIComponent(new URL(import.meta.url).pathname);
  const scriptPath = process.argv[1];
  if (modulePath === scriptPath || modulePath === `/${scriptPath}`) {
    return true;
  }
  if (
    typeof process.platform === "string" &&
    process.platform.startsWith("win")
  ) {
    const normalizedScript = scriptPath.replace(/\\/g, "/");
    if (
      modulePath === normalizedScript ||
      modulePath === `/${normalizedScript}`
    ) {
      return true;
    }
  }

  return false;
}

const isDirectExecution = isRunningDirectly();

if (isDirectExecution) {
  // Example usage when invoked with `node dist/diff.js`
  const leftExample =
    "The quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs.\nSphinx of black quartz, judge my vow.";
  const rightExample =
    "The quick red fox hopped over a lazy dog.\nhello world\nPack our box with five dozen liquor jugs.";

  const result = dmpDiff(leftExample, rightExample);

  console.log("Left (removed ranges highlighted):");
  console.log(highlightText(leftExample, result.left));
  console.log("\nRight (added ranges highlighted):");
  console.log(highlightText(rightExample, result.right));
  console.log("\nSide-by-side diff ranges:");
  console.log(JSON.stringify(result, null, 2));
}
