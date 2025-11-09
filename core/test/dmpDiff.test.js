import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { dmpDiff } from '../dist/index.js';

function mapRanges(ranges) {
  return ranges.map((range) => ({
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
    type: range.type,
  }));
}

describe('dmpDiff side-by-side ranges', () => {
  it('captures single-character substitutions', () => {
    const { left, right } = dmpDiff('abc', 'axc');

    assert.deepStrictEqual(mapRanges(left), [
      {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 2 },
        type: 'removed',
      },
    ]);

    assert.deepStrictEqual(mapRanges(right), [
      {
        start: { line: 0, character: 1 },
        end: { line: 0, character: 2 },
        type: 'added',
      },
    ]);
  });

  it('returns an empty range set when texts are identical', () => {
    const { left, right } = dmpDiff('same content\n', 'same content\n');

    assert.deepStrictEqual(left, []);
    assert.deepStrictEqual(right, []);
  });

  it('records insertions only on the right side', () => {
    const { left, right } = dmpDiff('keep\n', 'keep\nadded\n');

    assert.deepStrictEqual(left, []);

    assert.deepStrictEqual(mapRanges(right), [
      {
        start: { line: 1, character: 0 },
        end: { line: 2, character: 0 },
        type: 'added',
      },
    ]);
  });

  it('records deletions only on the left side', () => {
    const { left, right } = dmpDiff('keep\nremove\n', 'keep\n');

    assert.deepStrictEqual(mapRanges(left), [
      {
        start: { line: 1, character: 0 },
        end: { line: 2, character: 0 },
        type: 'removed',
      },
    ]);

    assert.deepStrictEqual(right, []);
  });

  it('handles newline-only additions and removals', () => {
    const multiline = 'one line\n';

    const addedNewline = dmpDiff('one line', multiline);
    assert.deepStrictEqual(addedNewline.left, []);
    assert.deepStrictEqual(mapRanges(addedNewline.right), [
      {
        start: { line: 0, character: 8 },
        end: { line: 1, character: 0 },
        type: 'added',
      },
    ]);

    const removedNewline = dmpDiff(multiline, 'one line');
    assert.deepStrictEqual(mapRanges(removedNewline.left), [
      {
        start: { line: 0, character: 8 },
        end: { line: 1, character: 0 },
        type: 'removed',
      },
    ]);
    assert.deepStrictEqual(removedNewline.right, []);
  });
});
