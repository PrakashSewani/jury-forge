import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  evaluate,
  flattenReport,
  type LicencePolicy,
  type PackageLicence,
  satisfiable,
} from './check-licences.ts';

const ALLOWED = new Set(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC']);
const FORBIDDEN = ['BUSL-1.1', 'SSPL-1.0', 'Elastic-2.0', 'Commons-Clause', 'GPL-3.0-only'];

const policy: LicencePolicy = {
  allowed: [...ALLOWED],
  exceptions: [{ name: 'tool-*', licence: 'MPL-2.0', scope: 'dev', reason: 'test' }],
};

const pkg = (name: string, licence: string): PackageLicence => ({
  name,
  version: '1.0.0',
  licence,
});

describe('satisfiable', () => {
  it.each([
    ['MIT', true],
    ['(MIT OR Apache-2.0)', true],
    ['MIT OR BUSL-1.1', true],
    ['MIT AND ISC', true],
    ['(MIT AND (ISC OR BUSL-1.1))', true],
    ['MIT AND BUSL-1.1', false],
    ['BUSL-1.1', false],
    ['SSPL-1.0', false],
    ['Elastic-2.0 OR SSPL-1.0', false],
    ['Apache-2.0 WITH LLVM-exception', false],
    ['UNKNOWN', false],
    ['SEE LICENSE IN LICENSE.md', false],
    ['', false],
    ['MIT OR', false],
    ['(MIT', false],
    ['MIT)', false],
    ['mit', false],
  ])('%s → %s', (expression, expected) => {
    expect(satisfiable(expression, ALLOWED)).toBe(expected);
  });

  const allowedId = fc.constantFrom(...ALLOWED);
  const forbiddenId = fc.constantFrom(...FORBIDDEN);

  it('a forbidden licence on every OR branch is never satisfiable', () => {
    fc.assert(
      fc.property(fc.array(forbiddenId, { minLength: 1, maxLength: 6 }), (ids) => {
        expect(satisfiable(ids.join(' OR '), ALLOWED)).toBe(false);
      }),
    );
  });

  it('an AND with any forbidden licence is never satisfiable', () => {
    fc.assert(
      fc.property(fc.array(allowedId, { maxLength: 5 }), forbiddenId, fc.nat(), (ids, bad, at) => {
        const parts = [...ids];
        parts.splice(at % (parts.length + 1), 0, bad);
        expect(satisfiable(parts.join(' AND '), ALLOWED)).toBe(false);
      }),
    );
  });

  it('one allowed OR branch is enough, whatever surrounds it', () => {
    fc.assert(
      fc.property(fc.array(forbiddenId, { maxLength: 5 }), allowedId, fc.nat(), (ids, ok, at) => {
        const parts = [...ids];
        parts.splice(at % (parts.length + 1), 0, ok);
        expect(satisfiable(`(${parts.join(' OR ')})`, ALLOWED)).toBe(true);
      }),
    );
  });

  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(typeof satisfiable(s, ALLOWED)).toBe('boolean');
      }),
    );
  });
});

describe('evaluate', () => {
  it('passes allowed licences and reports forbidden ones', () => {
    const violations = evaluate(
      [pkg('a', 'MIT'), pkg('b', 'BUSL-1.1'), pkg('c', '(MIT OR Apache-2.0)')],
      new Set(),
      policy,
    );
    expect(violations.map((v) => v.name)).toEqual(['b']);
  });

  it('honours a dev exception only while the package stays out of production', () => {
    const tool = pkg('tool-css', 'MPL-2.0');
    expect(evaluate([tool], new Set(), policy)).toEqual([]);
    expect(evaluate([tool], new Set(['tool-css']), policy)).toEqual([
      { ...tool, problem: 'dev-only exception, but reachable from production' },
    ]);
  });

  it('does not stretch an exception to a different licence', () => {
    expect(evaluate([pkg('tool-css', 'BUSL-1.1')], new Set(), policy)).toHaveLength(1);
  });

  it('flattens the pnpm report per version', () => {
    expect(flattenReport({ MIT: [{ name: 'x', versions: ['1.0.0', '2.0.0'] }] })).toEqual([
      pkg('x', 'MIT'),
      { name: 'x', version: '2.0.0', licence: 'MIT' },
    ]);
  });
});

describe('CLI', () => {
  it('exits non-zero and names BSL and SSPL dependencies', () => {
    const script = fileURLToPath(new URL('./check-licences.ts', import.meta.url));
    const fixture = fileURLToPath(new URL('./fixtures/licences-busl.json', import.meta.url));
    let status = 0;
    let stderr = '';
    try {
      execFileSync(process.execPath, [script, '--input', fixture], { stdio: 'pipe' });
    } catch (error) {
      const failure = error as { status: number; stderr: Buffer };
      status = failure.status;
      stderr = failure.stderr.toString();
    }
    expect(status).toBe(1);
    expect(stderr).toContain('source-available-db@2.3.0  "BUSL-1.1"');
    expect(stderr).toContain('server-side-thing@5.0.0  "SSPL-1.0"');
    expect(stderr).not.toContain('fine-package');
  });
});
