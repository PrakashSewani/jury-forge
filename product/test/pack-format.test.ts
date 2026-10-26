import type { PackManifest } from '@jury-forge/shared';
import { describe, expect, it } from 'vitest';
import {
  analyzePack,
  buildKnowledgeBlock,
  hashPackFiles,
  normalizePackPath,
  parsePackManifest,
  renderPackManifest,
  slugifyPackName,
  summarizeKnowledge,
  type ResolvedDoc,
  type ResolvedPack,
} from '../worker/lib/pack-format';
import { DEFAULT_SETTINGS } from '../worker/lib/settings';

const MANIFEST = `---
name: docs-style
description: House documentation conventions.
kind: skill
apply: paths
paths:
  - docs/**
never_quote:
  - docs/internal/**
owner: Docs team
license: MIT
metadata:
  team: docs
---
# Documentation style

Use sentence case for headings.
`;

function files(entries: Record<string, string>) {
  return Object.entries(entries).map(([path, text]) => ({ path, text }));
}

function settings(overrides: Partial<typeof DEFAULT_SETTINGS> = {}) {
  return {
    ...DEFAULT_SETTINGS,
    knowledgePackTotalBytes: 64_000,
    knowledgePackFileBytes: 32_000,
    knowledgePackFiles: 50,
    ...overrides,
  };
}

const MANIFEST_OBJECT: PackManifest = {
  name: 'A',
  description: 'Pack A.',
  kind: 'reference',
  apply: 'always',
  paths: [],
  neverQuote: [],
  owner: '',
};

function resolvedPack(overrides: Partial<ResolvedPack> = {}): ResolvedPack {
  return {
    packId: 'pack-a',
    versionId: 'version-a',
    slug: 'a',
    name: 'A',
    hash: 'a'.repeat(64),
    scope: 'global',
    precedence: 100,
    manifest: MANIFEST_OBJECT,
    manifestPath: 'SKILL.md',
    body: 'Use the A conventions.',
    ...overrides,
  };
}

function resolvedDoc(
  versionId: string,
  path: string,
  text: string,
  neverQuote = false,
): ResolvedDoc {
  return {
    versionId,
    path,
    text,
    bytes: new TextEncoder().encode(text).byteLength,
    neverQuote,
  };
}

describe('pack paths and slugs', () => {
  it('normalizes safe POSIX paths and rejects traversal', () => {
    expect(normalizePackPath('.\\docs\\a.md')).toBe('docs/a.md');
    expect(normalizePackPath('docs/a.md')).toBe('docs/a.md');
    expect(normalizePackPath('../a.md')).toBeNull();
    expect(normalizePackPath('/a.md')).toBeNull();
    expect(normalizePackPath('C:/a.md')).toBeNull();
    expect(normalizePackPath('docs//a.md')).toBeNull();
    expect(normalizePackPath('docs/./a.md')).toBeNull();
    expect(normalizePackPath('docs/a\u0000.md')).toBeNull();
    expect(normalizePackPath('docs/')).toBeNull();
  });

  it('derives a stable slug', () => {
    expect(slugifyPackName('Docs Style')).toBe('docs-style');
    expect(slugifyPackName('Café — Style')).toBe('cafe-style');
    expect(slugifyPackName('  ***  ')).toBe('pack');
  });
});

describe('manifest parsing', () => {
  it('parses fields, body and unknown frontmatter keys', () => {
    const parsed = parsePackManifest(MANIFEST);
    expect(parsed.errors).toEqual([]);
    expect(parsed.manifest).toMatchObject({
      name: 'docs-style',
      description: 'House documentation conventions.',
      kind: 'skill',
      apply: 'paths',
      paths: ['docs/**'],
      neverQuote: ['docs/internal/**'],
      owner: 'Docs team',
    });
    expect(parsed.body).toContain('Use sentence case for headings.');
  });

  it('defaults kind, apply, owner and empty lists', () => {
    const parsed = parsePackManifest('---\nname: Plain\ndescription: Plain pack.\n---\nBody.');
    expect(parsed.errors).toEqual([]);
    expect(parsed.manifest).toMatchObject({
      kind: 'reference',
      apply: 'always',
      paths: [],
      neverQuote: [],
      owner: '',
    });
  });

  it('accepts a single string for paths and never_quote', () => {
    const parsed = parsePackManifest(
      '---\nname: One\ndescription: One.\napply: paths\npaths: docs/**\nnever_quote: docs/x.md\n---\nBody.',
    );
    expect(parsed.manifest?.paths).toEqual(['docs/**']);
    expect(parsed.manifest?.neverQuote).toEqual(['docs/x.md']);
  });

  it('rejects a missing or invalid manifest', () => {
    expect(parsePackManifest('No frontmatter.').errors.length).toBeGreaterThan(0);
    expect(parsePackManifest('---\nname: "unterminated\n---\nBody.').errors[0]).toContain(
      'not valid YAML',
    );
    expect(parsePackManifest('---\ndescription: No name.\n---\nBody.').errors).toContain(
      'The manifest needs a non-empty "name".',
    );
    expect(parsePackManifest('---\nname: X\n---\nBody.').errors).toContain(
      'The manifest needs a non-empty "description".',
    );
    expect(
      parsePackManifest('---\nname: X\ndescription: X.\nkind: Not Valid\n---\nBody.').errors.length,
    ).toBeGreaterThan(0);
    expect(
      parsePackManifest('---\nname: X\ndescription: X.\napply: paths\n---\nBody.').errors,
    ).toContain('"paths" is required when "apply" is "paths".');
  });

  it('rejects non-string owner and unusable patterns', () => {
    expect(
      parsePackManifest('---\nname: X\ndescription: X.\nowner: 3\n---\nBody.').errors,
    ).toContain('"owner" must be a string.');
    expect(
      parsePackManifest(
        '---\nname: X\ndescription: X.\napply: paths\npaths:\n  - /absolute\n---\nBody.',
      ).errors.some((error) => error.includes('unusable pattern')),
    ).toBe(true);
  });
});

describe('pack analysis', () => {
  it('accepts a SKILL.md pack and reports docs, flags and ignored files', async () => {
    const analysis = await analyzePack(
      files({
        'SKILL.md': MANIFEST,
        'docs/a.md': 'Alpha.',
        'docs/internal/b.md': 'Secret.',
        'docs/logo.png': 'not really a png',
        'src/app.ts': 'not part of the pack',
      }),
    );
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.root).toBe('');
    expect(analysis.manifestPath).toBe('SKILL.md');
    expect(analysis.manifest.name).toBe('docs-style');
    expect(analysis.docs.map((doc) => doc.path)).toEqual(['docs/a.md', 'docs/internal/b.md']);
    expect(analysis.docs.find((doc) => doc.path === 'docs/internal/b.md')?.neverQuote).toBe(true);
    expect(analysis.ignoredCount).toBe(2);
    expect(analysis.ignoredFiles).toContain('src/app.ts');
    expect(analysis.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(analysis.warnings.some((warning) => warning.includes('binary'))).toBe(true);
  });

  it('strips a wrapper folder around SKILL.md', async () => {
    const analysis = await analyzePack(
      files({
        '.claude/skills/docs-style/SKILL.md': MANIFEST,
        '.claude/skills/docs-style/docs/a.md': 'Alpha.',
      }),
    );
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.root).toBe('.claude/skills/docs-style');
    expect(analysis.docs[0]?.path).toBe('docs/a.md');
    expect(analysis.ignoredCount).toBe(0);
  });

  it('accepts a single root Markdown manifest with a name', async () => {
    const analysis = await analyzePack(
      files({
        'agent.md': '---\nname: Agent\ndescription: An agent.\n---\nBody.',
        'docs/a.md': 'Alpha.',
      }),
    );
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    expect(analysis.manifestPath).toBe('agent.md');
    expect(analysis.manifest.name).toBe('Agent');
  });

  it('returns candidates when several packs are in one upload and uses a chosen root', async () => {
    const multiple = files({
      'a/SKILL.md': MANIFEST.replace('docs-style', 'A'),
      'a/docs/a.md': 'Alpha.',
      'b/SKILL.md': MANIFEST.replace('docs-style', 'B'),
      'b/docs/b.md': 'Beta.',
    });
    const ambiguous = await analyzePack(multiple);
    expect(ambiguous.ok).toBe(false);
    if (ambiguous.ok) return;
    expect(ambiguous.candidates.map((candidate) => candidate.root)).toEqual(['a', 'b']);

    const chosen = await analyzePack(multiple, { root: 'b' });
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.root).toBe('b');
    expect(chosen.manifest.name).toBe('B');
    expect(chosen.docs.map((doc) => doc.path)).toEqual(['docs/b.md']);
  });

  it('rejects unsafe paths, duplicate case paths and a missing manifest', async () => {
    const unsafe = await analyzePack(files({ '../SKILL.md': MANIFEST }));
    expect(unsafe.ok).toBe(false);
    if (unsafe.ok) return;
    expect(unsafe.errors[0]).toContain('Unsafe file path');

    const duplicate = await analyzePack(files({ 'SKILL.md': MANIFEST, 'skill.md': MANIFEST }));
    expect(duplicate.ok).toBe(false);

    const missing = await analyzePack(files({ 'docs/a.md': 'Alpha.' }));
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.errors.some((error) => error.includes('No SKILL.md'))).toBe(true);
  });

  it('reports oversized and too many docs', async () => {
    const largeDoc = await analyzePack(
      files({ 'SKILL.md': MANIFEST, 'docs/big.md': 'a'.repeat(64_001) }),
    );
    expect(largeDoc.ok).toBe(false);
    if (largeDoc.ok) return;
    expect(largeDoc.errors.some((error) => error.includes('per-doc limit'))).toBe(true);

    const many: Record<string, string> = { 'SKILL.md': MANIFEST };
    for (let index = 0; index < 101; index += 1) {
      many[`docs/${index}.md`] = 'x';
    }
    const tooMany = await analyzePack(files(many));
    expect(tooMany.ok).toBe(false);
    if (tooMany.ok) return;
    expect(tooMany.errors.some((error) => error.includes('at most 100'))).toBe(true);
  });

  it('rejects a manifest larger than the cap', async () => {
    const analysis = await analyzePack(
      files({ 'SKILL.md': `---\nname: Big\ndescription: Big.\n---\n${'x'.repeat(32_000)}` }),
    );
    expect(analysis.ok).toBe(false);
    if (analysis.ok) return;
    expect(analysis.errors.some((error) => error.includes('manifest is'))).toBe(true);
  });

  it('hashes the same text across CRLF and LF and changes with content', async () => {
    const lf = await hashPackFiles('SKILL.md', 'a\nb', [{ path: 'docs/x.md', text: 'c\nd' }]);
    const crlf = await hashPackFiles('SKILL.md', 'a\r\nb', [{ path: 'docs/x.md', text: 'c\r\nd' }]);
    expect(crlf).toBe(lf);
    const changed = await hashPackFiles('SKILL.md', 'a\nb', [{ path: 'docs/x.md', text: 'c\ne' }]);
    expect(changed).not.toBe(lf);
  });
});

describe('knowledge composition', () => {
  it('returns no block and an empty record when no pack applies', () => {
    const result = buildKnowledgeBlock([], [], [], settings());
    expect(result.block).toBeNull();
    expect(result.record).toMatchObject({
      applied: [],
      notApplied: [],
      totalBytes: 0,
      overBudget: false,
    });
  });

  it('never truncates the manifest and drops docs under a tiny budget', () => {
    const result = buildKnowledgeBlock(
      [resolvedPack()],
      [],
      [resolvedDoc('version-a', 'docs/a.md', 'Alpha.')],
      settings({ knowledgePackTotalBytes: 10 }),
    );
    expect(result.block).toContain('### A (reference)');
    expect(result.block).not.toContain('#### docs/a.md');
    expect(result.record.overBudget).toBe(true);
    expect(result.record.applied[0]?.droppedFiles).toEqual([
      { path: 'docs/a.md', reason: 'budget' },
    ]);
  });

  it('keeps the most specific docs when the budget is tight and renders broad to specific', () => {
    const broad = resolvedPack({
      packId: 'broad',
      versionId: 'broad-v',
      slug: 'broad',
      name: 'Broad',
      precedence: 100,
    });
    const specific = resolvedPack({
      packId: 'specific',
      versionId: 'specific-v',
      slug: 'specific',
      name: 'Specific',
      precedence: 300,
      manifest: { ...MANIFEST_OBJECT, name: 'Specific' },
    });
    const manifestsOnly = buildKnowledgeBlock([specific, broad], [], [], settings()).record;
    const manifestBytes = manifestsOnly.applied.reduce((sum, pack) => sum + pack.manifestBytes, 0);
    const specificBytes = new TextEncoder().encode('Specific docs.').byteLength;
    const result = buildKnowledgeBlock(
      [specific, broad],
      [],
      [
        resolvedDoc('broad-v', 'docs/broad.md', 'Broad docs.'),
        resolvedDoc('specific-v', 'docs/specific.md', 'Specific docs.'),
      ],
      settings({
        knowledgePackTotalBytes: manifestBytes + specificBytes + 1,
        knowledgePackFileBytes: 200,
        knowledgePackFiles: 50,
      }),
    );
    const applied = result.record.applied;
    expect(applied.map((pack) => pack.slug)).toEqual(['broad', 'specific']);
    expect(applied.find((pack) => pack.slug === 'specific')?.includedFiles).toEqual([
      'docs/specific.md',
    ]);
    expect(applied.find((pack) => pack.slug === 'broad')?.droppedFiles).toEqual([
      { path: 'docs/broad.md', reason: 'budget' },
    ]);
    expect(result.block?.indexOf('### Broad')).toBeLessThan(
      result.block?.indexOf('### Specific') ?? 0,
    );
  });

  it('withholds never_quote docs and records file-limit and too-large drops', () => {
    const pack = resolvedPack();
    const result = buildKnowledgeBlock(
      [pack],
      [],
      [
        resolvedDoc('version-a', 'docs/a.md', 'Alpha.', true),
        resolvedDoc('version-a', 'docs/b.md', 'x'.repeat(2_000)),
        resolvedDoc('version-a', 'docs/c.md', 'Charlie.'),
      ],
      settings({ knowledgePackFileBytes: 1_000, knowledgePackFiles: 1 }),
    );
    expect(result.block).not.toContain('Alpha.');
    expect(result.block).toContain('Charlie.');
    const applied = result.record.applied[0];
    expect(applied?.withheldFiles).toEqual(['docs/a.md']);
    expect(applied?.droppedFiles).toEqual([{ path: 'docs/b.md', reason: 'too-large' }]);
  });

  it('summarizes a run deduped by slug and hash', () => {
    const pack = resolvedPack();
    const first = buildKnowledgeBlock(
      [pack],
      [],
      [resolvedDoc('version-a', 'docs/a.md', 'Alpha.')],
      settings(),
    ).record;
    const second = buildKnowledgeBlock(
      [pack],
      [],
      [resolvedDoc('version-a', 'docs/a.md', 'Alpha, longer.')],
      settings(),
    ).record;
    const summary = summarizeKnowledge([first, second]);
    expect(summary.packs).toHaveLength(1);
    expect(summary.packs[0]?.reviewers).toBe(2);
    expect(summary.packs[0]?.bytes).toBe(
      Math.max(first.applied[0]?.bytes ?? 0, second.applied[0]?.bytes ?? 0),
    );
  });

  it('renders the manifest fields and body', () => {
    const text = renderPackManifest(
      {
        ...MANIFEST_OBJECT,
        name: 'Docs',
        kind: 'skill',
        apply: 'paths',
        paths: ['docs/**'],
        neverQuote: ['docs/x/**'],
        owner: 'Team',
      },
      'Body.',
    );
    expect(text).toContain('### Docs (skill)');
    expect(text).toContain('Owner: Team');
    expect(text).toContain('Applies: when changed files match docs/**');
    expect(text).toContain('Never quote');
    expect(text).toContain('Body.');
  });
});
