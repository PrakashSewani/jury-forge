import {
  RunDetailSchema,
  RunsPageSchema,
  TryRunResponseSchema,
  type Finding,
  type ProviderUsage,
  type RunDetail,
  type RunKnowledgeSummary,
  type RunMode,
  type RunReviewerKnowledge,
  type RunReviewerOutcome,
  type RunReviewerScope,
  type RunSkippedReviewer,
  type RunStatus,
  type RunSummary,
  type RunsPage,
  type TryRunResponse,
} from '@jury-forge/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { recordActivity } from '../lib/activity';
import { keyRingValues, loadKeyRing } from '../lib/crypto';
import {
  GitHubApiError,
  createInstallationToken,
  fetchOpenPullRequestSummary,
} from '../lib/github';
import { loadGitHubApp } from '../lib/github-app';
import { getMeta } from '../lib/instance';
import { getRepository } from '../lib/repositories';
import { errorResponse, respond } from '../lib/respond';
import { requireSession, sameOrigin, type AppEnv } from '../middleware';
import type { RunPayload } from '../run-engine';

export const runRoutes = new Hono<AppEnv>();

runRoutes.use('*', requireSession(), sameOrigin());

const RUN_COLUMNS =
  'id, delivery_id, repo_id, pr_number, head_sha, event, status, mode, error, review_url, files_json, scope_skip_json, knowledge_json, created_at, finished_at';

interface RunRow {
  id: string;
  delivery_id: string;
  repo_id: number;
  pr_number: number;
  head_sha: string;
  event: string;
  status: RunStatus;
  mode: RunMode;
  error: string | null;
  review_url: string | null;
  files_json: string;
  scope_skip_json: string;
  knowledge_json: string;
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
    mode: row.mode,
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
      return errorResponse('invalid_request', 400);
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
  return respond(RunsPageSchema, body);
});

const tryBody = z.object({
  repoId: z.number().int().positive(),
  prNumber: z.number().int().positive(),
  reviewerIds: z.array(z.string().min(1)).min(1).max(10),
});

// D-028: a manual try run posts nothing to GitHub — the run engine stops before its post step.
runRoutes.post('/try', async (c) => {
  const parsed = tryBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  const { repoId, prNumber } = parsed.data;
  const reviewerIds = [...new Set(parsed.data.reviewerIds)];
  const placeholders = reviewerIds.map(() => '?').join(', ');
  const available = await c.env.DB.prepare(
    `SELECT id FROM reviewers WHERE id IN (${placeholders}) AND enabled = 1 AND api_key_enc != ''`,
  )
    .bind(...reviewerIds)
    .all<{ id: string }>();
  if (available.results.length !== reviewerIds.length) {
    return errorResponse('reviewer_unavailable', 400);
  }

  const repository = await getRepository(c.env.DB, repoId);
  if (!repository) {
    return errorResponse('not_found', 404);
  }

  const values = keyRingValues(c.env);
  if (!values) {
    return errorResponse('encryption_key_unset', 500);
  }
  const installationIdValue = await getMeta(c.env.DB, 'installation_id');
  const app = await loadGitHubApp(c.env.DB, await loadKeyRing(values));
  if (!app || !installationIdValue) {
    return errorResponse('setup_required', 409);
  }

  const token = await createInstallationToken(
    app.appId,
    app.privateKey,
    Number(installationIdValue),
  );
  // D-028: the picker offers open pull requests only, and the endpoint is not the looser half — a
  // closed or merged pull request answers the same `not_found` a missing one does.
  const pullRequest = await fetchOpenPullRequestSummary(token, repository.fullName, prNumber).catch(
    (error: unknown) => {
      if (error instanceof GitHubApiError && error.status === 404) {
        return null;
      }
      throw error;
    },
  );
  if (pullRequest === null) {
    return errorResponse('not_found', 404);
  }

  const deliveryId = `try-${crypto.randomUUID()}`;
  const runKey = `${repoId}:${prNumber}:${pullRequest.headSha}:${deliveryId}`;
  const payload: RunPayload = {
    deliveryId,
    repoId,
    repoFullName: repository.fullName,
    prNumber,
    headSha: pullRequest.headSha,
    action: 'try',
    installationId: Number(installationIdValue),
    mode: 'manual',
    reviewerIds,
  };
  try {
    await c.env.RUNS.getByName(runKey).start(payload);
  } catch (error) {
    console.error(error);
    return errorResponse('kick_failed', 500);
  }
  await recordActivity(c.env.DB, {
    actor: c.get('user').login,
    action: 'run_try',
    target: runKey,
    detail: `${repository.fullName} #${prNumber} (manual)`,
  });
  return respond(TryRunResponseSchema, { runId: runKey } satisfies TryRunResponse, 202);
});

runRoutes.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<RunRow>();
  if (!row) {
    return errorResponse('not_found', 404);
  }
  const reviewerRows = await c.env.DB.prepare(
    'SELECT reviewer_id, status, findings_json, summary, usage_json, scope_json, knowledge_json, error FROM run_reviewers WHERE run_id = ? ORDER BY reviewer_id',
  )
    .bind(row.id)
    .all<{
      reviewer_id: string;
      status: RunReviewerOutcome['status'];
      findings_json: string | null;
      summary: string | null;
      usage_json: string | null;
      scope_json: string | null;
      knowledge_json: string | null;
      error: string | null;
    }>();
  const reviewers: RunReviewerOutcome[] = reviewerRows.results.map((reviewer) => ({
    reviewerId: reviewer.reviewer_id,
    status: reviewer.status,
    findings: reviewer.findings_json ? (JSON.parse(reviewer.findings_json) as Finding[]) : null,
    summary: reviewer.summary,
    usage: reviewer.usage_json ? (JSON.parse(reviewer.usage_json) as ProviderUsage) : null,
    scope: reviewer.scope_json ? (JSON.parse(reviewer.scope_json) as RunReviewerScope) : null,
    knowledge: reviewer.knowledge_json
      ? (JSON.parse(reviewer.knowledge_json) as RunReviewerKnowledge)
      : null,
    error: reviewer.error,
  }));
  const body: RunDetail = {
    run: summaryFromRow(row),
    reviewers,
    skippedReviewers: JSON.parse(row.scope_skip_json) as RunSkippedReviewer[],
    changedFiles: (JSON.parse(row.files_json) as string[]).length,
    knowledge: JSON.parse(row.knowledge_json) as RunKnowledgeSummary,
  };
  return respond(RunDetailSchema, body);
});
