import {
  RepositoryPullRequestSchema,
  RepositoryReviewerSchema,
  RepositoryReviewerUpdateSchema,
  RepositorySchema,
  ScopePreviewRequestSchema,
  ScopePreviewResponseSchema,
  type ScopePreviewResponse,
} from '@jury-forge/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { recordActivity } from '../lib/activity';
import { keyRingValues, loadKeyRing } from '../lib/crypto';
import {
  createInstallationToken,
  fetchInstallationRepositories,
  fetchOpenPullRequests,
} from '../lib/github';
import { loadGitHubApp } from '../lib/github-app';
import { getMeta } from '../lib/instance';
import {
  getRepository,
  listRepositories,
  listRepositoryReviewers,
  setRepositoryEnabled,
  setRepositoryReviewers,
  syncRepositories,
  type RepositorySyncRow,
} from '../lib/repositories';
import { errorResponse, respond } from '../lib/respond';
import { listReviewers } from '../lib/reviewers';
import { scopedFiles } from '../lib/scope';
import { requireSession, sameOrigin, type AppEnv } from '../middleware';

const MAX_REPOSITORY_PAGES = 10;
const PAGE_SIZE = 100;

const patchBody = z.object({ enabled: z.boolean() });
const reviewersBody = z.object({
  reviewers: z.array(RepositoryReviewerUpdateSchema),
});

export const repositoryRoutes = new Hono<AppEnv>();

repositoryRoutes.use('*', requireSession(), sameOrigin());

repositoryRoutes.get('/', async (c) => {
  // The term the list is narrowed by. The escape happens where the pattern is built; here it is only
  // read, so an absent `q` and an empty one behave the same way: no filter.
  const search = c.req.query('q') ?? '';
  const refresh = c.req.query('refresh');
  if (refresh === '1' || refresh === 'true') {
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
    const rows: RepositorySyncRow[] = [];
    for (let page = 1; page <= MAX_REPOSITORY_PAGES; page += 1) {
      const response = await fetchInstallationRepositories(token, page);
      rows.push(...response.repositories);
      if (response.repositories.length === 0 || page * PAGE_SIZE >= response.totalCount) {
        break;
      }
    }
    await syncRepositories(c.env.DB, rows);
  }
  return respond(z.array(RepositorySchema), await listRepositories(c.env.DB, search));
});

repositoryRoutes.patch('/:repoId', async (c) => {
  const parsed = patchBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  const repoId = Number(c.req.param('repoId'));
  if (!Number.isInteger(repoId)) {
    return errorResponse('invalid_request', 400);
  }
  if (!(await getRepository(c.env.DB, repoId))) {
    return errorResponse('not_found', 404);
  }
  await setRepositoryEnabled(c.env.DB, repoId, parsed.data.enabled);
  const updated = await getRepository(c.env.DB, repoId);
  if (!updated) {
    return errorResponse('not_found', 404);
  }
  await recordActivity(c.env.DB, {
    actor: c.get('user').login,
    action: 'repository_toggle',
    target: updated.fullName,
    detail: parsed.data.enabled ? 'enabled' : 'disabled',
  });
  return respond(RepositorySchema, updated);
});

repositoryRoutes.get('/:repoId/reviewers', async (c) => {
  const repoId = Number(c.req.param('repoId'));
  if (!Number.isInteger(repoId)) {
    return errorResponse('invalid_request', 400);
  }
  if (!(await getRepository(c.env.DB, repoId))) {
    return errorResponse('not_found', 404);
  }
  return respond(
    z.array(RepositoryReviewerSchema),
    await listRepositoryReviewers(c.env.DB, repoId),
  );
});

/**
 * D-032: match typed patterns against the newest run's changed files for this repository. No
 * GitHub call, nothing persisted — the last run already proves what the patterns see.
 */
repositoryRoutes.post('/:repoId/scope-preview', async (c) => {
  const parsed = ScopePreviewRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  const repoId = Number(c.req.param('repoId'));
  if (!Number.isInteger(repoId)) {
    return errorResponse('invalid_request', 400);
  }
  if (!(await getRepository(c.env.DB, repoId))) {
    return errorResponse('not_found', 404);
  }
  const row = await c.env.DB.prepare(
    "SELECT id, head_sha, files_json FROM runs WHERE repo_id = ? AND files_json != '[]' ORDER BY created_at DESC, id DESC LIMIT 1",
  )
    .bind(repoId)
    .first<{ id: string; head_sha: string; files_json: string }>();
  const body: ScopePreviewResponse =
    row === null
      ? { runId: null, headSha: null, total: 0, matched: [] }
      : {
          runId: row.id,
          headSha: row.head_sha,
          total: (JSON.parse(row.files_json) as string[]).length,
          matched: scopedFiles(JSON.parse(row.files_json) as string[], {
            pathsInclude: parsed.data.pathsInclude,
            pathsExclude: parsed.data.pathsExclude,
            contextPaths: [],
          }),
        };
  return respond(ScopePreviewResponseSchema, body);
});

// D-028: the open pull requests the manual try-run picker offers.
repositoryRoutes.get('/:repoId/pulls', async (c) => {
  const repoId = Number(c.req.param('repoId'));
  if (!Number.isInteger(repoId)) {
    return errorResponse('invalid_request', 400);
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
  return respond(
    z.array(RepositoryPullRequestSchema),
    await fetchOpenPullRequests(token, repository.fullName),
  );
});

repositoryRoutes.put('/:repoId/reviewers', async (c) => {
  const parsed = reviewersBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  const repoId = Number(c.req.param('repoId'));
  if (!Number.isInteger(repoId)) {
    return errorResponse('invalid_request', 400);
  }
  const repository = await getRepository(c.env.DB, repoId);
  if (!repository) {
    return errorResponse('not_found', 404);
  }
  const reviewerNames = new Map(
    (await listReviewers(c.env.DB)).map((reviewer) => [reviewer.id, reviewer.name]),
  );
  if (parsed.data.reviewers.some((update) => !reviewerNames.has(update.reviewerId))) {
    return errorResponse('invalid_request', 400);
  }
  await setRepositoryReviewers(c.env.DB, repoId, parsed.data.reviewers);
  const summary = parsed.data.reviewers
    .map(
      (update) =>
        `${reviewerNames.get(update.reviewerId) ?? update.reviewerId}: ${update.enabled ? 'on' : 'off'}`,
    )
    .join(', ');
  await recordActivity(c.env.DB, {
    actor: c.get('user').login,
    action: 'repository_reviewers',
    target: repository.fullName,
    detail: summary === '' ? null : summary,
  });
  return respond(
    z.array(RepositoryReviewerSchema),
    await listRepositoryReviewers(c.env.DB, repoId),
  );
});
