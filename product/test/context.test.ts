import type { Reviewer } from '@jury-forge/shared';
import { describe, expect, it } from 'vitest';
import {
  buildReviewContext,
  buildReviewPrompt,
  buildSystemPrompt,
  CONTEXT_LIMITS,
  contextNotes,
  type PullFile,
} from '../worker/lib/context';

const REVIEWER: Pick<Reviewer, 'name' | 'instructions' | 'rules'> = {
  name: 'Security',
  instructions: 'Hunt for injection.',
  rules: 'Block on secrets.',
};

describe('system prompt', () => {
  it('combines the reviewer identity, instructions, rules, and the output contract', () => {
    const prompt = buildSystemPrompt(REVIEWER);
    expect(prompt).toContain('Security');
    expect(prompt).toContain('Hunt for injection.');
    expect(prompt).toContain('Block on secrets.');
    expect(prompt).toContain('"findings"');
  });
});

describe('review context', () => {
  it('skips lockfiles, generated files, binaries, and files without a patch', () => {
    const files: PullFile[] = [
      { filename: 'src/app.ts', patch: '@@ -1 +1 @@\n-old\n+new' },
      { filename: 'package-lock.json', patch: '@@ -1 +1 @@\n-a\n+b' },
      { filename: 'assets/logo.png', patch: null },
      { filename: 'web/dist/bundle.min.js', patch: '@@ -1 +1 @@\n-a\n+b' },
      { filename: 'empty.tsv' },
    ];
    const context = buildReviewContext(files);
    expect(context.files.map((file) => file.filename)).toEqual(['src/app.ts']);
    expect(context.skipped).toEqual([
      'package-lock.json',
      'assets/logo.png',
      'web/dist/bundle.min.js',
      'empty.tsv',
    ]);
  });

  it('truncates a file at the per-file cap', () => {
    const patch = `@@ -1 +1 @@\n+${'a'.repeat(CONTEXT_LIMITS.fileBytes + 5_000)}`;
    const context = buildReviewContext([{ filename: 'big.ts', patch }]);
    expect(context.truncated).toEqual(['big.ts']);
    expect(context.files[0]?.patch.length).toBeLessThan(patch.length);
    expect(new TextEncoder().encode(context.files[0]?.patch ?? '').length).toBeLessThanOrEqual(
      CONTEXT_LIMITS.fileBytes,
    );
  });

  it('omits files beyond the total budget', () => {
    const patch = `@@ -1 +1 @@\n+${'b'.repeat(30_000)}`;
    const files: PullFile[] = Array.from({ length: 8 }, (_, index) => ({
      filename: `file-${index}.ts`,
      patch,
    }));
    const context = buildReviewContext(files);
    expect(context.files.length).toBeLessThan(8);
    expect(context.omitted.length).toBeGreaterThan(0);
    expect(context.totalBytes).toBeLessThanOrEqual(CONTEXT_LIMITS.totalBytes);
  });

  it('records notes for the review summary', () => {
    const context = buildReviewContext([
      { filename: 'src/app.ts', patch: '@@ -1 +1 @@\n-a\n+b' },
      { filename: 'yarn.lock', patch: '@@ -1 +1 @@\n-a\n+b' },
    ]);
    const notes = contextNotes(context);
    expect(notes.some((note) => note.includes('yarn.lock'))).toBe(true);
  });
});

describe('review prompt', () => {
  it('includes the title, a truncated description, the file list, and diffs', () => {
    const context = buildReviewContext([{ filename: 'src/app.ts', patch: '@@ -1 +1 @@\n-a\n+b' }]);
    const prompt = buildReviewPrompt({ title: 'Fix the widget', body: 'x'.repeat(5_000) }, context);
    expect(prompt).toContain('Pull request: Fix the widget');
    expect(prompt).toContain('- src/app.ts');
    expect(prompt).toContain('```diff');
    expect(prompt).not.toContain('x'.repeat(4_097));
  });

  it('marks an empty description', () => {
    const prompt = buildReviewPrompt({ title: 't', body: null }, buildReviewContext([]));
    expect(prompt).toContain('(no description)');
    expect(prompt).toContain('Changed files (0):');
  });
});
