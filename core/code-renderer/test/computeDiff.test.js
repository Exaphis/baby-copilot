// Tests for computeDiff using the demo inputs from demo-site
// Uses Node's built-in test runner (node:test)

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

// Import the built JS output
import { CodeRenderer } from '../dist/index.js';

// Helpers
function joinLines(lines) {
  return lines.join('\n') + '\n'; // demos terminate with a trailing newline
}

function computeLineStarts(text) {
  const starts = [0];
  let i = 0;
  while (i < text.length) {
    const ch = text.charCodeAt(i);
    if (ch === 0x0d /* \r */) {
      // Handle CRLF or lone CR
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 0x0a /* \n */) {
        i += 2;
      } else {
        i += 1;
      }
      starts.push(i);
      continue;
    }
    if (ch === 0x0a /* \n */) {
      i += 1;
      starts.push(i);
      continue;
    }
    i += 1;
  }
  return starts;
}

function posToOffset(text, pos) {
  const starts = computeLineStarts(text);
  const lineStart = starts[pos.line] ?? 0;
  return lineStart + pos.character;
}

function removeRanges(text, ranges) {
  // Convert to absolute half-open intervals and remove from end to start
  const intervals = ranges.map((r) => {
    const start = posToOffset(text, r.start);
    const end = posToOffset(text, r.end);
    return { start, end };
  });
  intervals.sort((a, b) => b.start - a.start);
  let out = text;
  for (const { start, end } of intervals) {
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

function verifyBasicDiff(left, right) {
  const cr = CodeRenderer.getInstance();
  const { content, diffRanges } = cr.computeDiff(left, right);

  assert.ok(typeof content === 'string');
  assert.ok(Array.isArray(diffRanges));

  const removedAdded = removeRanges(
    content,
    diffRanges.filter((r) => r.type === 'added')
  );
  assert.equal(
    removedAdded,
    left,
    'Content without added ranges must equal left/original'
  );

  const removedRemoved = removeRanges(
    content,
    diffRanges.filter((r) => r.type === 'removed')
  );
  assert.equal(
    removedRemoved,
    right,
    'Content without removed ranges must equal right/updated'
  );

  assert.ok(
    diffRanges.some((r) => r.type === 'added') ||
      diffRanges.some((r) => r.type === 'removed'),
    'Expected at least one diff range for demo'
  );
}

// Demo: greet
describe('CodeRenderer.computeDiff — greet demo', () => {
  it('reconstructs left/right', () => {
    const left = joinLines([
      '// Edit these files to live-reload the diff',
      'type User = { id: number; name: string }',
      'function greet(user: User) {',
      '  const msg = `Hello, ${user.name}!`',
      '  console.log(msg)',
      '  return msg',
      '}',
      '',
      'greet({ id: 1, name: "World" })',
    ]);
    const right = joinLines([
      '// Edit these files to live-reload the diff',
      'type User = { id: number; name: string; email?: string }',
      'function greet(user: User) {',
      '  const msg = `Hello, ${user.name}!`',
      '  console.log(msg.toUpperCase())',
      '  return msg',
      '}',
      '',
      'greet({ id: 1, name: "Baby Copilot" })',
    ]);
    verifyBasicDiff(left, right);
  });
});

// Demo: algorithm
describe('CodeRenderer.computeDiff — algorithm demo', () => {
  it('reconstructs left/right', () => {
    const left = joinLines([
      '// Simple sum implementation',
      'export function sum(a: number, b: number) {',
      '  return a + b',
      '}',
      '',
      'export function fib(n: number): number {',
      '  if (n <= 1) return n;',
      '  return fib(n-1) + fib(n-2);',
      '}',
    ]);
    const right = joinLines([
      '// Sum with validation + faster fib',
      'export function sum(a: number, b: number) {',
      "  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error('NaN');",
      '  return a + b',
      '}',
      '',
      'export function fib(n: number): number {',
      '  const dp = [0,1];',
      '  for (let i=2;i<=n;i++) dp[i]=dp[i-1]+dp[i-2];',
      '  return dp[n];',
      '}',
    ]);
    verifyBasicDiff(left, right);
  });
});

// Demo: config
describe('CodeRenderer.computeDiff — config demo', () => {
  it('reconstructs left/right', () => {
    const left = joinLines([
      'fooba',
      '',
      'test',
    ]);
    const right = joinLines([
      'foobar',
      'test',
    ]);
    verifyBasicDiff(left, right);
  });
});
