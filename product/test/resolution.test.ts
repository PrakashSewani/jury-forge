import type { Finding } from '@jury-forge/shared';
import { describe, expect, it } from 'vitest';
import { compareFindings, findingKey } from '../worker/lib/resolution';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    file: 'src/a.ts',
    line: 1,
    severity: 'warning',
    title: 'Title',
    body: 'body',
    ...overrides,
  };
}

describe('findingKey', () => {
  it('keys by file, line (or file alone), and case-folded title', () => {
    expect(findingKey(finding({ file: 'src/a.ts', line: 4, title: '  Odd Naming ' }))).toBe(
      'src/a.ts::4::odd naming',
    );
    expect(findingKey(finding({ file: 'src/a.ts', line: undefined, title: 'File-level' }))).toBe(
      'src/a.ts::::file-level',
    );
  });
});

describe('compareFindings', () => {
  it('buckets resolved, still present, and new findings', () => {
    const previous = [finding({ line: 1, title: 'Fixed' }), finding({ line: 2, title: 'Kept' })];
    const current = [finding({ line: 2, title: 'Kept' }), finding({ line: 3, title: 'Added' })];

    const buckets = compareFindings(previous, current);
    expect(buckets.resolved.map((item) => item.title)).toEqual(['Fixed']);
    expect(buckets.stillPresent.map((item) => item.title)).toEqual(['Kept']);
    expect(buckets.new.map((item) => item.title)).toEqual(['Added']);
  });

  it('de-duplicates each side by key, keeping the first occurrence', () => {
    const previous = [
      finding({ line: 1, title: 'Dup', body: 'first' }),
      finding({ line: 1, title: 'dup', body: 'second' }),
    ];
    const current = [finding({ line: 1, title: 'DUP', body: 'current' })];

    const buckets = compareFindings(previous, current);
    expect(buckets.stillPresent).toEqual([finding({ line: 1, title: 'DUP', body: 'current' })]);
    expect(buckets.resolved).toEqual([]);
    expect(buckets.new).toEqual([]);
  });

  it('case-folds titles and treats file-level findings as distinct from lined ones', () => {
    const previous = [
      finding({ line: undefined, title: 'Whole File' }),
      finding({ line: 5, title: 'Case Folded' }),
    ];
    const current = [
      finding({ line: 5, title: 'case folded' }),
      finding({ line: 1, title: 'whole file' }),
    ];

    const buckets = compareFindings(previous, current);
    expect(buckets.resolved).toEqual([finding({ line: undefined, title: 'Whole File' })]);
    expect(buckets.stillPresent).toEqual([finding({ line: 5, title: 'case folded' })]);
    expect(buckets.new).toEqual([finding({ line: 1, title: 'whole file' })]);
  });

  it('keeps ordering: resolved follows previous, still present and new follow current', () => {
    const previous = [
      finding({ line: 3, title: 'R3' }),
      finding({ line: 1, title: 'R1' }),
      finding({ line: 2, title: 'Both' }),
    ];
    const current = [
      finding({ line: 2, title: 'Both' }),
      finding({ line: 9, title: 'N9' }),
      finding({ line: 8, title: 'N8' }),
    ];

    const buckets = compareFindings(previous, current);
    expect(buckets.resolved.map((item) => item.title)).toEqual(['R3', 'R1']);
    expect(buckets.stillPresent.map((item) => item.title)).toEqual(['Both']);
    expect(buckets.new.map((item) => item.title)).toEqual(['N9', 'N8']);
  });
});
