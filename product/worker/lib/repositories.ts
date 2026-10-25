import type { Repository, RepositoryReviewer, RepositoryReviewerUpdate } from '@jury-forge/shared';
import { parsePatternList } from './scope';

interface RepositoryRow {
  repo_id: number;
  full_name: string;
  private: number;
  enabled: number;
}

export interface RepositorySyncRow {
  repoId: number;
  fullName: string;
  private: boolean;
}

function fromRow(row: RepositoryRow): Repository {
  return {
    repoId: row.repo_id,
    fullName: row.full_name,
    private: row.private === 1,
    enabled: row.enabled === 1,
  };
}

/**
 * A contains-pattern for `LIKE`. The term's own `%`, `_` and `\` are escaped — a repository name can
 * carry a literal `_`, and an unescaped `%` in the term would match every row — so the only wildcards
 * left in the pattern are the two this function adds.
 */
function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * The repository list, optionally narrowed to the rows whose `full_name` contains `term`. `term` is
 * trimmed (a blank one is no filter at all) and matched case-insensitively: both sides are folded
 * with `LOWER`, so the match does not depend on the connection's `case_sensitive_like` setting.
 */
export async function listRepositories(db: D1Database, term = ''): Promise<Repository[]> {
  const search = term.trim();
  const columns = 'SELECT repo_id, full_name, private, enabled FROM repositories';
  const order = 'ORDER BY full_name COLLATE NOCASE, repo_id';
  const statement =
    search === ''
      ? db.prepare(`${columns} ${order}`)
      : db
          .prepare(`${columns} WHERE LOWER(full_name) LIKE ? ESCAPE '\\' ${order}`)
          .bind(containsPattern(search.toLowerCase()));
  const result = await statement.all<RepositoryRow>();
  return result.results.map(fromRow);
}

export async function getRepository(db: D1Database, repoId: number): Promise<Repository | null> {
  const row = await db
    .prepare('SELECT repo_id, full_name, private, enabled FROM repositories WHERE repo_id = ?')
    .bind(repoId)
    .first<RepositoryRow>();
  return row === null ? null : fromRow(row);
}

export async function setRepositoryEnabled(
  db: D1Database,
  repoId: number,
  enabled: boolean,
): Promise<void> {
  await db
    .prepare('UPDATE repositories SET enabled = ? WHERE repo_id = ?')
    .bind(enabled ? 1 : 0, repoId)
    .run();
}

/**
 * Upserts GitHub's repository list. New repositories arrive disabled — enabling one is an
 * explicit dashboard action (D-016); existing rows keep their `enabled` flag but refresh their
 * name and visibility.
 */
export async function syncRepositories(db: D1Database, rows: RepositorySyncRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db.batch(
    rows.map((row) =>
      db
        .prepare(
          'INSERT INTO repositories (repo_id, full_name, private, enabled) VALUES (?, ?, ?, 0) ON CONFLICT (repo_id) DO UPDATE SET full_name = excluded.full_name, private = excluded.private',
        )
        .bind(row.repoId, row.fullName, row.private ? 1 : 0),
    ),
  );
}

interface ReviewerRepositoryRow {
  reviewer_id: string;
  name: string;
  enabled: number;
  paths_include: string;
  paths_exclude: string;
  context_paths: string;
}

export async function listRepositoryReviewers(
  db: D1Database,
  repoId: number,
): Promise<RepositoryReviewer[]> {
  const result = await db
    .prepare(
      `SELECT r.id AS reviewer_id, r.name, COALESCE(rr.enabled, 1) AS enabled,
              COALESCE(rr.paths_include, '[]') AS paths_include,
              COALESCE(rr.paths_exclude, '[]') AS paths_exclude,
              COALESCE(rr.context_paths, '[]') AS context_paths
       FROM reviewers r
       LEFT JOIN reviewer_repositories rr ON rr.reviewer_id = r.id AND rr.repo_id = ?
       ORDER BY r.name COLLATE NOCASE, r.id`,
    )
    .bind(repoId)
    .all<ReviewerRepositoryRow>();
  return result.results.map((row) => ({
    reviewerId: row.reviewer_id,
    name: row.name,
    enabled: row.enabled === 1,
    pathsInclude: parsePatternList(row.paths_include),
    pathsExclude: parsePatternList(row.paths_exclude),
    contextPaths: parsePatternList(row.context_paths),
  }));
}

/**
 * D-031: a pair's scope is replaced only by the fields the caller sends — an update that leaves
 * them out keeps what is stored, which is what the toggle-only callers rely on.
 */
export async function setRepositoryReviewers(
  db: D1Database,
  repoId: number,
  updates: RepositoryReviewerUpdate[],
): Promise<void> {
  if (updates.length === 0) {
    return;
  }
  const stored = await db
    .prepare(
      'SELECT reviewer_id, paths_include, paths_exclude, context_paths FROM reviewer_repositories WHERE repo_id = ?',
    )
    .bind(repoId)
    .all<{
      reviewer_id: string;
      paths_include: string;
      paths_exclude: string;
      context_paths: string;
    }>();
  const existing = new Map(stored.results.map((row) => [row.reviewer_id, row]));
  await db.batch(
    updates.map((update) => {
      const current = existing.get(update.reviewerId);
      const pathsInclude =
        update.pathsInclude === undefined
          ? (current?.paths_include ?? '[]')
          : JSON.stringify(update.pathsInclude);
      const pathsExclude =
        update.pathsExclude === undefined
          ? (current?.paths_exclude ?? '[]')
          : JSON.stringify(update.pathsExclude);
      const contextPaths =
        update.contextPaths === undefined
          ? (current?.context_paths ?? '[]')
          : JSON.stringify(update.contextPaths);
      return db
        .prepare(
          `INSERT INTO reviewer_repositories (reviewer_id, repo_id, enabled, paths_include, paths_exclude, context_paths)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (reviewer_id, repo_id) DO UPDATE SET
             enabled = excluded.enabled,
             paths_include = excluded.paths_include,
             paths_exclude = excluded.paths_exclude,
             context_paths = excluded.context_paths`,
        )
        .bind(
          update.reviewerId,
          repoId,
          update.enabled ? 1 : 0,
          pathsInclude,
          pathsExclude,
          contextPaths,
        );
    }),
  );
}
