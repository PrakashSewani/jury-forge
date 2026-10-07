import { Webhooks } from '@octokit/webhooks';
import { Hono } from 'hono';
import { z } from 'zod';
import { importEncryptionKey } from '../lib/crypto';
import { loadGitHubApp } from '../lib/github-app';
import type { AppEnv } from '../middleware';
import type { RunPayload } from '../run-engine';

const DELIVERY_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const RUN_ACTIONS = new Set(['opened', 'reopened', 'synchronize', 'ready_for_review']);

const pullRequestPayload = z.object({
  action: z.string(),
  installation: z.object({ id: z.number() }),
  repository: z.object({ id: z.number(), full_name: z.string() }),
  pull_request: z.object({
    number: z.number(),
    draft: z.boolean().optional(),
    head: z.object({ sha: z.string() }),
  }),
});

export const webhookRoutes = new Hono<AppEnv>();

webhookRoutes.post('/github', async (c) => {
  const encryptionKeyValue = c.env.ENCRYPTION_KEY;
  if (!encryptionKeyValue) {
    return c.json({ error: 'encryption_key_unset' }, 500);
  }
  const app = await loadGitHubApp(c.env.DB, await importEncryptionKey(encryptionKeyValue));
  if (!app) {
    return c.json({ error: 'setup_required' }, 503);
  }

  // Verify before parsing: HMAC-SHA256 over the exact raw body (timing-safe inside verify).
  const signature = c.req.header('x-hub-signature-256');
  if (!signature) {
    return c.json({ error: 'missing_signature' }, 401);
  }
  const body = await c.req.text();
  const valid = await new Webhooks({ secret: app.webhookSecret }).verify(body, signature);
  if (!valid) {
    return c.json({ error: 'invalid_signature' }, 401);
  }

  const deliveryId = c.req.header('x-github-delivery');
  if (!deliveryId) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const event = c.req.header('x-github-event');
  if (event !== 'pull_request') {
    return c.body(null, 202);
  }

  const bodyJson = parseJson(body);
  if (bodyJson === undefined) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const parsed = pullRequestPayload.safeParse(bodyJson);
  if (!parsed.success) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const { action, repository, pull_request: pullRequest, installation } = parsed.data;
  if (!RUN_ACTIONS.has(action) || pullRequest.draft === true) {
    return c.body(null, 202);
  }

  // De-duplicate deliveries; prune old ones opportunistically.
  const [, inserted] = await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM webhook_deliveries WHERE received_at < unixepoch() - ?').bind(
      DELIVERY_RETENTION_SECONDS,
    ),
    c.env.DB.prepare(
      'INSERT INTO webhook_deliveries (delivery_id) VALUES (?) ON CONFLICT (delivery_id) DO NOTHING',
    ).bind(deliveryId),
  ]);
  if ((inserted.meta.changes ?? 0) === 0) {
    return c.body(null, 202);
  }

  const payload: RunPayload = {
    deliveryId,
    repoId: repository.id,
    repoFullName: repository.full_name,
    prNumber: pullRequest.number,
    headSha: pullRequest.head.sha,
    action,
    installationId: installation.id,
  };
  const runKey = `${payload.repoId}:${payload.prNumber}:${payload.headSha}:${payload.deliveryId}`;
  try {
    await c.env.RUNS.getByName(runKey).start(payload);
  } catch (error) {
    console.error(error);
    // Remove the delivery row so GitHub's retry is not de-duplicated away.
    await c.env.DB.prepare('DELETE FROM webhook_deliveries WHERE delivery_id = ?')
      .bind(deliveryId)
      .run();
    return c.json({ error: 'kick_failed' }, 500);
  }
  return c.body(null, 202);
});

function parseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
