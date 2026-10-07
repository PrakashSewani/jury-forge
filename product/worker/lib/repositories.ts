import type { Repository, RepositoryReviewer, RepositoryReviewerUpdate } from '@jury-forge/shared';

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

export async function listRepositories(db: D1Database): Promise<Repository[]> {
  const result = await db
    .prepare(
      'SELECT repo_id, full_name, private, enabled FROM repositories ORDER BY full_name COLLATE NOCASE, repo_id',
    )
    .all<RepositoryRow>();
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

export async function listRepositoryReviewers(
  db: D1Database,
  repoId: number,
): Promise<RepositoryReviewer[]> {
  const result = await db
    .prepare(
      `SELECT r.id AS reviewer_id, r.name, COALESCE(rr.enabled, 1) AS enabled
       FROM reviewers r
       LEFT JOIN reviewer_repositories rr ON rr.reviewer_id = r.id AND rr.repo_id = ?
       ORDER BY r.name COLLATE NOCASE, r.id`,
    )
    .bind(repoId)
    .all<{ reviewer_id: string; name: string; enabled: number }>();
  return result.results.map((row) => ({
    reviewerId: row.reviewer_id,
    name: row.name,
    enabled: row.enabled === 1,
  }));
}

export async function setRepositoryReviewers(
  db: D1Database,
  repoId: number,
  updates: RepositoryReviewerUpdate[],
): Promise<void> {
  if (updates.length === 0) {
    return;
  }
  await db.batch(
    updates.map((update) =>
      db
        .prepare(
          'INSERT INTO reviewer_repositories (reviewer_id, repo_id, enabled) VALUES (?, ?, ?) ON CONFLICT (reviewer_id, repo_id) DO UPDATE SET enabled = excluded.enabled',
        )
        .bind(update.reviewerId, repoId, update.enabled ? 1 : 0),
    ),
  );
}
