import type { Reviewer } from '@jury-forge/shared';
import { describe, expect, it } from 'vitest';
import {
  buildRepoInstructionsBlock,
  buildReviewContext,
  buildReviewPrompt,
  buildSystemPrompt,
  CONTEXT_LIMITS,
  contextNotes,
  prioritizedOrder,
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

  it('honors custom limits for truncation and quotes them in the notes', () => {
    const limits = { totalBytes: 25_000, fileBytes: 20_000 };
    const bigPatch = `@@ -1 +1 @@\n+${'c'.repeat(20_500)}`;
    const fillerPatch = `@@ -1 +1 @@\n+${'d'.repeat(6_000)}`;
    const context = buildReviewContext(
      [
        { filename: 'big.ts', patch: bigPatch },
        { filename: 'extra.ts', patch: fillerPatch },
      ],
      undefined,
      limits,
    );
    expect(context.truncated).toEqual(['big.ts']);
    expect(context.omitted).toEqual(['extra.ts']);
    expect(new TextEncoder().encode(context.files[0]?.patch ?? '').length).toBeLessThanOrEqual(
      limits.fileBytes,
    );
    expect(context.totalBytes).toBeLessThanOrEqual(limits.totalBytes);

    const notes = contextNotes(context, limits);
    expect(notes.join(' ')).toContain('Truncated to 20 KB');
    expect(notes.join(' ')).toContain('25 KB total budget');
  });
});

describe('file priority order', () => {
  it('leads with added source and trails docs within a weight', () => {
    const order = prioritizedOrder([
      { filename: 'README.md', status: 'modified' },
      { filename: 'src/app.ts', status: 'added' },
      { filename: 'src/old.ts', status: 'renamed' },
      { filename: 'src/util.ts', status: 'modified' },
      { filename: 'docs/guide.md', status: 'added' },
    ]);
    expect(order).toEqual([1, 4, 3, 0, 2]);
  });

  it('is stable for entries with equal weight', () => {
    const order = prioritizedOrder([
      { filename: 'a.ts', status: 'modified' },
      { filename: 'b.ts', status: 'modified' },
    ]);
    expect(order).toEqual([0, 1]);
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

  it('inserts repository instructions between the description and the changed files', () => {
    const context = buildReviewContext([{ filename: 'src/app.ts', patch: '@@ -1 +1 @@\n-a\n+b' }]);
    const prompt = buildReviewPrompt({ title: 'Fix the widget', body: 'Please review.' }, context, {
      repoInstructions: 'Repository instructions block.',
    });
    const descriptionIndex = prompt.indexOf('Please review.');
    const instructionsIndex = prompt.indexOf('Repository instructions block.');
    const changedIndex = prompt.indexOf('Changed files (');
    expect(descriptionIndex).toBeGreaterThanOrEqual(0);
    expect(instructionsIndex).toBeGreaterThan(descriptionIndex);
    expect(changedIndex).toBeGreaterThan(instructionsIndex);
    expect(prompt).toContain('Please review.\n\nRepository instructions block.\n\nChanged files (');
  });

  it('omits the repository instructions when the option is absent', () => {
    const prompt = buildReviewPrompt(
      { title: 't', body: null },
      buildReviewContext([{ filename: 'src/app.ts', patch: '@@ -1 +1 @@\n-a\n+b' }]),
    );
    expect(prompt).not.toContain('Repository instructions');
  });
});

describe('repository instructions block', () => {
  const HEADER =
    'Repository instructions (from the repository at the reviewed revision — conventions to follow; your own instructions and rules take precedence):';

  it('returns null with no files or only empty files', () => {
    expect(buildRepoInstructionsBlock([], 8_000)).toBeNull();
    expect(
      buildRepoInstructionsBlock(
        [
          { path: 'AGENTS.md', text: '   ' },
          { path: 'CONTRIBUTING.md', text: '\n' },
        ],
        8_000,
      ),
    ).toBeNull();
  });

  it('includes two files that fit, in order with both headings', () => {
    const block = buildRepoInstructionsBlock(
      [
        { path: 'AGENTS.md', text: 'Follow the style guide.' },
        { path: 'CONTRIBUTING.md', text: 'Run the tests.' },
      ],
      8_000,
    );
    expect(block).not.toBeNull();
    expect(block).toContain(HEADER);
    expect(block).toContain('### AGENTS.md');
    expect(block).toContain('### CONTRIBUTING.md');
    expect(block).toContain('Follow the style guide.');
    expect(block).toContain('Run the tests.');
    expect(block?.indexOf('### AGENTS.md')).toBeLessThan(
      block?.indexOf('### CONTRIBUTING.md') ?? 0,
    );
    expect(block).not.toContain('truncated');
  });

  it('truncates the file that crosses the budget at the remaining bytes', () => {
    const block = buildRepoInstructionsBlock(
      [
        { path: 'AGENTS.md', text: 'a'.repeat(40) },
        { path: 'CONTRIBUTING.md', text: 'b'.repeat(200) },
      ],
      100,
    );
    expect(block).toContain('a'.repeat(40));
    expect(block).toContain('b'.repeat(60));
    expect(block).not.toContain('b'.repeat(61));
    expect(block).toContain('… truncated at 100 bytes.');
  });

  it('omits and names a file that does not fit at all', () => {
    const block = buildRepoInstructionsBlock(
      [
        { path: 'AGENTS.md', text: 'a'.repeat(100) },
        { path: 'CONTRIBUTING.md', text: 'b'.repeat(10) },
      ],
      100,
    );
    expect(block).toContain('Not included for the 100 byte budget: CONTRIBUTING.md.');
    expect(block).not.toContain('### CONTRIBUTING.md');
  });

  it('honours a custom maxBytes', () => {
    const block = buildRepoInstructionsBlock(
      [{ path: 'AGENTS.md', text: 'c'.repeat(2_000) }],
      1_000,
    );
    expect(block).toContain('c'.repeat(1_000));
    expect(block).not.toContain('c'.repeat(1_001));
    expect(block).toContain('… truncated at 1000 bytes.');
  });
});
