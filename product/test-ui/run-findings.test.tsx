import type { Finding, RunDetail } from '@jury-forge/shared';
import { describe, expect, it } from 'vitest';
import { findingAsText, groupByFile } from '../src/pages/RunDetailPage';

const names = new Map([
  ['rev-security', 'Security'],
  ['rev-docs', 'Documentation'],
]);

function finding(overrides: Partial<Finding>): Finding {
  return {
    file: 'src/a.ts',
    severity: 'info',
    title: 'A finding',
    body: 'Details.',
    ...overrides,
  };
}

function outcome(reviewerId: string, findings: Finding[]): RunDetail['reviewers'][number] {
  return {
    reviewerId,
    status: 'completed',
    findings,
  } as unknown as RunDetail['reviewers'][number];
}

describe('groupByFile', () => {
  it('groups findings from every reviewer under the file they name', () => {
    const groups = groupByFile(
      [
        outcome('rev-security', [finding({ file: 'src/a.ts', title: 'Injection' })]),
        outcome('rev-docs', [finding({ file: 'src/a.ts', title: 'Stale link' })]),
      ],
      names,
      'all',
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].file).toBe('src/a.ts');
    expect(groups[0].findings.map((entry) => entry.reviewer)).toEqual([
      'Security',
      'Documentation',
    ]);
  });

  it('sorts a file group most severe first', () => {
    const groups = groupByFile(
      [
        outcome('rev-security', [
          finding({ severity: 'info', title: 'Minor' }),
          finding({ severity: 'error', title: 'Critical' }),
          finding({ severity: 'warning', title: 'Medium' }),
        ]),
      ],
      names,
      'all',
    );
    expect(groups[0].findings.map((entry) => entry.finding.title)).toEqual([
      'Critical',
      'Medium',
      'Minor',
    ]);
  });

  it('keeps files in a stable alphabetical order', () => {
    const groups = groupByFile(
      [outcome('rev-security', [finding({ file: 'zeta.ts' }), finding({ file: 'alpha.ts' })])],
      names,
      'all',
    );
    expect(groups.map((group) => group.file)).toEqual(['alpha.ts', 'zeta.ts']);
  });

  it('applies the severity filter before grouping', () => {
    const groups = groupByFile(
      [
        outcome('rev-security', [
          finding({ file: 'a.ts', severity: 'error' }),
          finding({ file: 'b.ts', severity: 'info' }),
        ]),
      ],
      names,
      'error',
    );
    expect(groups.map((group) => group.file)).toEqual(['a.ts']);
  });

  it('returns no groups when no finding matches', () => {
    expect(groupByFile([outcome('rev-security', [])], names, 'all')).toEqual([]);
  });
});

describe('findingAsText', () => {
  it('carries severity, title, location and body so a paste is useful alone', () => {
    const text = findingAsText(
      finding({ file: 'src/a.ts', line: 14, severity: 'error', title: 'Leak', body: 'Bad.' }),
    );
    expect(text).toBe('[error] Leak (src/a.ts:14)\n\nBad.');
  });
});
