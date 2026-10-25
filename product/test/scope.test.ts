import { describe, expect, it } from 'vitest';
import {
  contextRoot,
  EMPTY_SCOPE,
  globMatches,
  hasPathFilters,
  normalizePattern,
  parsePatternList,
  referenceCandidates,
  scopedFiles,
} from '../worker/lib/scope';

describe('scope patterns', () => {
  it('matches a star inside one segment only', () => {
    expect(globMatches('*.md', 'README.md')).toBe(true);
    expect(globMatches('*.md', 'docs/README.md')).toBe(false);
    expect(globMatches('docs/*.md', 'docs/guide.md')).toBe(true);
    expect(globMatches('docs/*.md', 'docs/nested/guide.md')).toBe(false);
  });

  it('matches across segments with a double star, including zero of them', () => {
    expect(globMatches('docs/**', 'docs/guide.md')).toBe(true);
    expect(globMatches('docs/**', 'docs/nested/deep/guide.md')).toBe(true);
    expect(globMatches('**/*.md', 'README.md')).toBe(true);
    expect(globMatches('**/*.md', 'docs/guide.md')).toBe(true);
    expect(globMatches('**/*.md', 'docs/guide.txt')).toBe(false);
  });

  it('matches one character with a question mark and treats dots literally', () => {
    expect(globMatches('src/?.ts', 'src/a.ts')).toBe(true);
    expect(globMatches('src/?.ts', 'src/ab.ts')).toBe(false);
    expect(globMatches('src/a.ts', 'src/aXts')).toBe(false);
  });

  it('treats a trailing slash as the whole subtree', () => {
    expect(normalizePattern('docs/')).toBe('docs/**');
    expect(globMatches('docs/', 'docs/a/b.md')).toBe(true);
    expect(globMatches('docs/', 'guide.md')).toBe(false);
  });

  it('is case-sensitive and anchored to the whole path', () => {
    expect(globMatches('Docs/**', 'docs/guide.md')).toBe(false);
    expect(globMatches('docs', 'docs/guide.md')).toBe(false);
  });

  it('refuses absolute and traversing patterns', () => {
    expect(normalizePattern('/etc/passwd')).toBeNull();
    expect(normalizePattern('../outside/**')).toBeNull();
    expect(normalizePattern('docs/../../outside')).toBeNull();
    expect(globMatches('../outside/**', '../outside/x')).toBe(false);
  });

  it('parses a stored list tolerantly and keeps what was typed', () => {
    expect(parsePatternList('["docs/**", 3, "", " docs/ "]')).toEqual(['docs/**', 'docs/']);
    expect(parsePatternList('not json')).toEqual([]);
    expect(parsePatternList('{"docs":true}')).toEqual([]);
    expect(parsePatternList(null)).toEqual([]);
    expect(parsePatternList('["../x"]')).toEqual([]);
  });

  it('derives the literal root worth fetching', () => {
    expect(contextRoot('docs/**')).toBe('docs');
    expect(contextRoot('docs/')).toBe('docs');
    expect(contextRoot('docs/legacy/*.md')).toBe('docs/legacy');
    expect(contextRoot('*.md')).toBe('');
    expect(contextRoot('docs/*/guide.md')).toBe('docs');
    expect(contextRoot('../outside/**')).toBeNull();
  });
});

describe('reviewer filtering', () => {
  const files = ['docs/guide.md', 'docs/legacy/old.md', 'src/app.ts', 'README.md'];

  it('keeps every file when there are no include patterns', () => {
    expect(scopedFiles(files, EMPTY_SCOPE)).toEqual(files);
    expect(hasPathFilters(EMPTY_SCOPE)).toBe(false);
  });

  it('includes then excludes', () => {
    const scope = {
      ...EMPTY_SCOPE,
      pathsInclude: ['docs/**', '*.md'],
      pathsExclude: ['docs/legacy/**'],
    };
    expect(scopedFiles(files, scope)).toEqual(['docs/guide.md', 'README.md']);
    expect(hasPathFilters(scope)).toBe(true);
  });

  it('drops a reviewer when nothing survives', () => {
    const scope = { ...EMPTY_SCOPE, pathsInclude: ['site/**'] };
    expect(scopedFiles(files, scope)).toEqual([]);
  });

  it('selects reference candidates from the tree in order', () => {
    expect(referenceCandidates(files, ['docs/'])).toEqual(['docs/guide.md', 'docs/legacy/old.md']);
    expect(referenceCandidates(files, [])).toEqual([]);
  });
});
