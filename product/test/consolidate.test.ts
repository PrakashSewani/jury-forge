import type { Finding } from '@jury-forge/shared';
import { describe, expect, it } from 'vitest';
import {
  consolidateReview,
  FINDING_CAPS,
  newFileLines,
  parseFindings,
} from '../worker/lib/consolidate';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    file: 'src/a.ts',
    line: 1,
    severity: 'warning',
    title: 'title',
    body: 'body',
    ...overrides,
  };
}

describe('parseFindings', () => {
  it('accepts a findings object and a bare array', () => {
    expect(parseFindings({ findings: [finding()] })).toEqual([finding()]);
    expect(parseFindings([finding()])).toEqual([finding()]);
  });

  it('normalizes invalid severity and non-integer lines', () => {
    const parsed = parseFindings({
      findings: [{ file: 'a.ts', line: 'three', severity: 'loud', title: 't', body: 'b' }],
    });
    expect(parsed).toEqual([{ file: 'a.ts', severity: 'info', title: 't', body: 'b' }]);
  });

  it('drops findings without a file, title, or body', () => {
    const parsed = parseFindings({
      findings: [finding(), { title: 'no file' }, { file: 'a.ts' }, 'junk', null],
    });
    expect(parsed).toEqual([finding()]);
  });

  it('truncates oversized fields and stores at most 50 findings', () => {
    const parsed = parseFindings({
      findings: Array.from({ length: 60 }, () => ({
        file: 'a.ts',
        title: 'T'.repeat(200),
        body: 'B'.repeat(3_000),
      })),
    });
    expect(parsed.length).toBe(FINDING_CAPS.stored);
    expect(parsed[0]?.title.length).toBe(120);
    expect(parsed[0]?.body.length).toBe(2_000);
  });
});

describe('newFileLines', () => {
  it('collects right-side lines from a patch', () => {
    const patch = ['@@ -1,3 +1,4 @@', ' context', '-removed', '+added', '+added2', ' tail'].join(
      '\n',
    );
    expect(newFileLines(patch)).toEqual(new Set([1, 2, 3, 4]));
  });

  it('handles multiple hunks', () => {
    const patch = [
      '@@ -1 +1,2 @@',
      '-a',
      '+b',
      '+c',
      '@@ -10,2 +11,2 @@',
      ' keep',
      '-drop',
      '+add',
    ].join('\n');
    expect(newFileLines(patch)).toEqual(new Set([1, 2, 11, 12]));
  });
});

describe('consolidateReview', () => {
  const patch = [
    '@@ -1 +1,20 @@',
    ...Array.from({ length: 20 }, (_, index) => `+line ${index + 1}`),
  ].join('\n');

  it('inlines only findings on diff lines and overflows the rest', () => {
    const patches = new Map([['src/a.ts', patch]]);
    const result = consolidateReview(
      [
        {
          reviewerId: 'r1',
          findings: [
            finding({ line: 5 }),
            finding({ line: 999 }),
            finding({ line: undefined }),
            finding({ file: 'other.ts', line: 1 }),
          ],
        },
      ],
      patches,
    );
    expect(result.inline).toHaveLength(1);
    expect(result.inline[0]?.finding.line).toBe(5);
    expect(result.overflow[0]?.findings).toHaveLength(3);
  });

  it('applies the per-reviewer and per-run caps', () => {
    const patches = new Map([['src/a.ts', patch]]);
    const many = Array.from({ length: 15 }, (_, index) => finding({ line: index + 1 }));
    const result = consolidateReview(
      [
        { reviewerId: 'r1', findings: many },
        { reviewerId: 'r2', findings: many },
        { reviewerId: 'r3', findings: many },
      ],
      patches,
    );
    expect(result.inline.length).toBe(25);
    const counts = new Map<string, number>();
    for (const entry of result.inline) {
      counts.set(entry.reviewerId, (counts.get(entry.reviewerId) ?? 0) + 1);
    }
    expect(counts.get('r1')).toBe(10);
    expect(counts.get('r2')).toBe(10);
    expect(counts.get('r3')).toBe(5);
    expect(result.overflow.map((group) => group.findings.length)).toEqual([5, 5, 10]);
  });
});
