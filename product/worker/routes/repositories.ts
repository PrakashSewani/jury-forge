import { Hono } from 'hono';
import { z } from 'zod';
import { importEncryptionKey } from '../lib/crypto';
import { createInstallationToken, fetchInstallationRepositories } from '../lib/github';
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
import { listReviewers } from '../lib/reviewers';
import { requireSession, sameOrigin, type AppEnv } from '../middleware';

const MAX_REPOSITORY_PAGES = 10;
const PAGE_SIZE = 100;

const patchBody = z.object({ enabled: z.boolean() });
const reviewersBody = z.object({
  reviewers: z.array(z.object({ reviewerId: z.string().min(1), enabled: z.boolean() })),
});

export const repositoryRoutes = new Hono<AppEnv>();

repositoryRoutes.use('*', requireSession(), sameOrigin());

repositoryRoutes.get('/', async (c) => {
  const refresh = c.req.query('refresh');
  if (refresh === '1' || refresh === 'true') {
    const encryptionKeyValue = c.env.ENCRYPTION_KEY;
    if (!encryptionKeyValue) {
      return c.json({ error: 'encryption_key_unset' }, 500);
    }
    const installationIdValue = await getMeta(c.env.DB, 'installation_id');
    const app = await loadGitHubApp(c.env.DB, await importEncryptionKey(encryptionKeyValue));
    if (!app || !installationIdValue) {
      return c.json({ error: 'setup_required' }, 409);
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
  return c.json(await listRepositories(c.env.DB));
});

repositoryRoutes.patch('/:repoId', async (c) => {
  const parsed = patchBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const repoId = Number(c.req.param('repoId'));
  if (!Number.isInteger(repoId)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  if (!(await getRepository(c.env.DB, repoId))) {
    return c.json({ error: 'not_found' }, 404);
  }
  await setRepositoryEnabled(c.env.DB, repoId, parsed.data.enabled);
  const updated = await getRepository(c.env.DB, repoId);
  if (!updated) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json(updated);
});

repositoryRoutes.get('/:repoId/reviewers', async (c) => {
  const repoId = Number(c.req.param('repoId'));
  if (!Number.isInteger(repoId)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  if (!(await getRepository(c.env.DB, repoId))) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json(await listRepositoryReviewers(c.env.DB, repoId));
});

repositoryRoutes.put('/:repoId/reviewers', async (c) => {
  const parsed = reviewersBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const repoId = Number(c.req.param('repoId'));
  if (!Number.isInteger(repoId)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  if (!(await getRepository(c.env.DB, repoId))) {
    return c.json({ error: 'not_found' }, 404);
  }
  const known = new Set((await listReviewers(c.env.DB)).map((reviewer) => reviewer.id));
  if (parsed.data.reviewers.some((update) => !known.has(update.reviewerId))) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  await setRepositoryReviewers(c.env.DB, repoId, parsed.data.reviewers);
  return c.json(await listRepositoryReviewers(c.env.DB, repoId));
});
