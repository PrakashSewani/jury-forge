import type {
  Finding,
  RunDetail,
  RunReviewerOutcome,
  RunStatus,
  RunSummary,
  RunsPage,
} from '@jury-forge/shared';
import { Hono } from 'hono';
import { requireSession, type AppEnv } from '../middleware';

export const runRoutes = new Hono<AppEnv>();

runRoutes.use('*', requireSession());

const RUN_COLUMNS =
  'id, delivery_id, repo_id, pr_number, head_sha, event, status, error, review_url, created_at, finished_at';

interface RunRow {
  id: string;
  delivery_id: string;
  repo_id: number;
  pr_number: number;
  head_sha: string;
  event: string;
  status: RunStatus;
  error: string | null;
  review_url: string | null;
  created_at: number;
  finished_at: number | null;
}

function summaryFromRow(row: RunRow): RunSummary {
  return {
    id: row.id,
    repoId: row.repo_id,
    prNumber: row.pr_number,
    headSha: row.head_sha,
    event: row.event,
    status: row.status,
    error: row.error,
    reviewUrl: row.review_url,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

runRoutes.get('/', async (c) => {
  const rawLimit = Number(c.req.query('limit') ?? '50');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
  const cursor = c.req.query('cursor');

  let rows: D1Result<RunRow>;
  if (cursor !== undefined) {
    const separator = cursor.indexOf(':');
    const createdAt = Number(cursor.slice(0, separator));
    const id = separator === -1 ? '' : cursor.slice(separator + 1);
    if (separator === -1 || id === '' || !Number.isFinite(createdAt)) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    rows = await c.env.DB.prepare(
      `SELECT ${RUN_COLUMNS} FROM runs WHERE created_at < ? OR (created_at = ? AND id < ?) ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
      .bind(createdAt, createdAt, id, limit)
      .all<RunRow>();
  } else {
    rows = await c.env.DB.prepare(
      `SELECT ${RUN_COLUMNS} FROM runs ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
      .bind(limit)
      .all<RunRow>();
  }

  const runs = rows.results.map(summaryFromRow);
  const last = runs[runs.length - 1];
  const body: RunsPage = {
    runs,
    nextCursor: runs.length === limit && last ? `${last.createdAt}:${last.id}` : null,
  };
  return c.json(body);
});

runRoutes.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<RunRow>();
  if (!row) {
    return c.json({ error: 'not_found' }, 404);
  }
  const reviewerRows = await c.env.DB.prepare(
    'SELECT reviewer_id, status, findings_json, error FROM run_reviewers WHERE run_id = ? ORDER BY reviewer_id',
  )
    .bind(row.id)
    .all<{
      reviewer_id: string;
      status: RunReviewerOutcome['status'];
      findings_json: string | null;
      error: string | null;
    }>();
  const reviewers: RunReviewerOutcome[] = reviewerRows.results.map((reviewer) => ({
    reviewerId: reviewer.reviewer_id,
    status: reviewer.status,
    findings: reviewer.findings_json ? (JSON.parse(reviewer.findings_json) as Finding[]) : null,
    error: reviewer.error,
  }));
  const body: RunDetail = { run: summaryFromRow(row), reviewers };
  return c.json(body);
});
