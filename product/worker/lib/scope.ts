// D-031: a reviewer↔repository pair's scope. Patterns are repository-relative POSIX globs with
// `*` inside one segment, `**` across segments, `?` as one non-`/` character, and a trailing `/`
// meaning the whole subtree. Exclusions are their own field; there is no negation syntax.

export interface ReviewerScope {
  pathsInclude: string[];
  pathsExclude: string[];
  contextPaths: string[];
}

export const EMPTY_SCOPE: ReviewerScope = {
  pathsInclude: [],
  pathsExclude: [],
  contextPaths: [],
};

const MAX_PATTERNS = 20;
const MAX_PATTERN_LENGTH = 200;

const cache = new Map<string, RegExp | null>();

/**
 * Trims a stored or submitted pattern into its matching form, or `null` when it can never match
 * safely (empty, absolute, or carrying a `.`/`..` segment).
 */
export function normalizePattern(pattern: string): string | null {
  const trimmed = pattern.trim();
  if (trimmed.startsWith('/')) {
    return null;
  }
  let value = trimmed.replace(/^\.\//, '');
  if (value === '' || value.length > MAX_PATTERN_LENGTH) {
    return null;
  }
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  if (value.endsWith('/')) {
    value += '**';
  }
  return value;
}

function compile(pattern: string): RegExp | null {
  const normalized = normalizePattern(pattern);
  if (normalized === null) {
    return null;
  }
  const cached = cache.get(normalized);
  if (cached !== undefined) {
    return cached;
  }
  let source = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] ?? '';
    if (character === '*') {
      if (normalized[index + 1] === '*') {
        index += 1;
        if (normalized[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    }
  }
  const compiled = new RegExp(`^${source}$`);
  cache.set(normalized, compiled);
  return compiled;
}

/** Case-sensitive, whole-path match. An unusable pattern matches nothing. */
export function globMatches(pattern: string, path: string): boolean {
  const compiled = compile(pattern);
  return compiled !== null && compiled.test(path);
}

/** Tolerant read of a stored JSON array: anything unusable degrades to no patterns. */
export function parsePatternList(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const patterns: string[] = [];
  for (const value of parsed) {
    if (typeof value !== 'string') {
      continue;
    }
    // D-032: validate, but keep the pattern as typed — normalization happens at match time.
    if (normalizePattern(value) !== null) {
      patterns.push(value.trim());
    }
    if (patterns.length >= MAX_PATTERNS) {
      break;
    }
  }
  return patterns;
}

/**
 * D-032: the literal prefix of a pattern before the first segment carrying a wildcard — the
 * directory whose tree is worth fetching. `docs/**` and `docs/` are `docs`; `*.md` is the whole
 * repository (`''`). `null` for a pattern that can never match.
 */
export function contextRoot(pattern: string): string | null {
  const normalized = normalizePattern(pattern);
  if (normalized === null) {
    return null;
  }
  const root: string[] = [];
  for (const segment of normalized.split('/')) {
    if (segment.includes('*') || segment.includes('?')) {
      break;
    }
    root.push(segment);
  }
  return root.join('/');
}

export function hasPathFilters(scope: ReviewerScope): boolean {
  return scope.pathsInclude.length > 0 || scope.pathsExclude.length > 0;
}

/** The changed files a reviewer may see: include first (empty = all), then exclude. */
export function scopedFiles(files: string[], scope: ReviewerScope): string[] {
  return files
    .filter(
      (file) =>
        scope.pathsInclude.length === 0 ||
        scope.pathsInclude.some((pattern) => globMatches(pattern, file)),
    )
    .filter((file) => !scope.pathsExclude.some((pattern) => globMatches(pattern, file)));
}

/** The repository files a reviewer's reference context names, in tree order. */
export function referenceCandidates(treePaths: string[], contextPaths: string[]): string[] {
  if (contextPaths.length === 0) {
    return [];
  }
  return treePaths.filter((path) => contextPaths.some((pattern) => globMatches(pattern, path)));
}
