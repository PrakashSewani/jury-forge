import { env } from 'cloudflare:workers';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { encryptSecret, keyRingValues, loadKeyRing } from '../worker/lib/crypto';
import { createSession } from '../worker/lib/sessions';
import { resetInstanceState } from './db';
import { network } from './network';
import { ORIGIN, seedGitHubApp } from './webhook-helpers';

const REPO_ID = 101;
const FULL_NAME = 'octocat/hello';
const PR_NUMBER = 1;
const HEAD_SHA = 'cafe1234';

beforeEach(resetInstanceState);

async function session(): Promise<string> {
  const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
  return `jf_session=${id}`;
}

async function seedRepo(repoId: number, fullName: string, enabled = true): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO repositories (repo_id, full_name, private, enabled) VALUES (?, ?, 0, ?)',
  )
    .bind(repoId, fullName, enabled ? 1 : 0)
    .run();
}

async function seedReviewer(
  id: string,
  name: string,
  options: { enabled?: boolean; withKey?: boolean } = {},
): Promise<void> {
  const values = keyRingValues(env);
  if (!values) {
    throw new Error('ENCRYPTION_KEY missing');
  }
  const ring = await loadKeyRing(values);
  const apiKeyEnc = (options.withKey ?? true) ? await encryptSecret(ring, 'sk-test') : '';
  await env.DB.prepare(
    'INSERT INTO reviewers (id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      name,
      '',
      '',
      'openai',
      'https://providers.test/v1',
      apiKeyEnc,
      'model-x',
      '{}',
      (options.enabled ?? true) ? 1 : 0,
    )
    .run();
}

async function seedAppAndInstallation(): Promise<void> {
  await seedGitHubApp();
  await env.DB.prepare(
    "INSERT INTO instance_meta (key, value) VALUES ('installation_id', '4242')",
  ).run();
}

function mockGitHubPulls(): void {
  network.use(
    http.post('https://api.github.com/app/installations/4242/access_tokens', () =>
      HttpResponse.json({ token: 'ghs_test', expires_at: '2099-01-01T00:00:00Z' }),
    ),
    http.get('https://api.github.com/repos/octocat/hello/pulls', () =>
      HttpResponse.json([
        {
          number: 1,
          title: 'Fix the widget',
          head: { sha: HEAD_SHA },
          user: { login: 'octocat' },
          draft: false,
        },
        {
          number: 2,
          title: 'Draft idea',
          head: { sha: 'beef5678' },
          user: null,
          draft: true,
        },
      ]),
    ),
    http.get('https://api.github.com/repos/octocat/hello/pulls/1', () =>
      HttpResponse.json({
        number: 1,
        title: 'Fix the widget',
        head: { sha: HEAD_SHA },
        user: { login: 'octocat' },
        draft: false,
      }),
    ),
    http.get('https://api.github.com/repos/octocat/hello/pulls/999', () =>
      HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
    ),
  );
}

async function tryRequest(
  body: unknown,
  options: { cookie?: string; origin?: string | null } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.cookie) {
    headers.Cookie = options.cookie;
  }
  if (options.origin !== null) {
    headers.Origin = options.origin ?? ORIGIN;
  }
  return app.request(
    `${ORIGIN}/api/runs/try`,
    { method: 'POST', headers, body: JSON.stringify(body) },
    env,
  );
}

describe('manual try run api', () => {
  it('requires a session', async () => {
    const response = await tryRequest({ repoId: REPO_ID, prNumber: PR_NUMBER, reviewerIds: ['r'] });
    expect(response.status).toBe(401);
  });

  it('rejects a foreign or missing Origin', async () => {
    const cookie = await session();
    const foreign = await tryRequest(
      { repoId: REPO_ID, prNumber: PR_NUMBER, reviewerIds: ['r'] },
      { cookie, origin: 'https://evil.example' },
    );
    expect(foreign.status).toBe(403);

    const missing = await tryRequest(
      { repoId: REPO_ID, prNumber: PR_NUMBER, reviewerIds: ['r'] },
      { cookie, origin: null },
    );
    expect(missing.status).toBe(403);
  });

  it('rejects a malformed body', async () => {
    const cookie = await session();
    const response = await tryRequest({ repoId: REPO_ID, prNumber: PR_NUMBER }, { cookie });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_request' });
  });

  it('rejects an unknown, keyless, or disabled reviewer', async () => {
    const cookie = await session();
    await seedReviewer('rev-key', 'Security');
    await seedReviewer('rev-nokey', 'No Key', { withKey: false });
    await seedReviewer('rev-off', 'Disabled', { enabled: false });
    await seedRepo(REPO_ID, FULL_NAME);

    for (const reviewerIds of [['nope'], ['rev-nokey'], ['rev-off']]) {
      const response = await tryRequest(
        { repoId: REPO_ID, prNumber: PR_NUMBER, reviewerIds },
        { cookie },
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'reviewer_unavailable' });
    }
  });

  it('404s for an unknown repository and a missing pull request', async () => {
    const cookie = await session();
    await seedReviewer('rev-key', 'Security');
    await seedRepo(REPO_ID, FULL_NAME);
    await seedAppAndInstallation();
    mockGitHubPulls();

    const unknownRepo = await tryRequest(
      { repoId: 999, prNumber: PR_NUMBER, reviewerIds: ['rev-key'] },
      { cookie },
    );
    expect(unknownRepo.status).toBe(404);
    await expect(unknownRepo.json()).resolves.toEqual({ error: 'not_found' });

    const missingPr = await tryRequest(
      { repoId: REPO_ID, prNumber: 999, reviewerIds: ['rev-key'] },
      { cookie },
    );
    expect(missingPr.status).toBe(404);
    await expect(missingPr.json()).resolves.toEqual({ error: 'not_found' });
  });

  it('kicks a manual run, records it, and logs the activity', async () => {
    const cookie = await session();
    await seedReviewer('rev-key', 'Security');
    await seedRepo(REPO_ID, FULL_NAME);
    await seedAppAndInstallation();
    mockGitHubPulls();

    const response = await tryRequest(
      { repoId: REPO_ID, prNumber: PR_NUMBER, reviewerIds: ['rev-key'] },
      { cookie },
    );
    expect(response.status).toBe(202);
    const { runId } = (await response.json()) as { runId: string };
    expect(runId).toMatch(new RegExp(`^${REPO_ID}:${PR_NUMBER}:${HEAD_SHA}:try-`));

    const row = await env.DB.prepare('SELECT status, mode, head_sha FROM runs WHERE id = ?')
      .bind(runId)
      .first<{ status: string; mode: string; head_sha: string }>();
    expect(row).toEqual({ status: 'running', mode: 'manual', head_sha: HEAD_SHA });

    const activity = await env.DB.prepare(
      "SELECT actor, action, target, detail FROM activity_log WHERE action = 'run_try'",
    ).first<{ actor: string; action: string; target: string; detail: string }>();
    expect(activity).toEqual({
      actor: 'octocat',
      action: 'run_try',
      target: runId,
      detail: `${FULL_NAME} #${PR_NUMBER} (manual)`,
    });
  });

  it('lists the open pull requests for the picker and 404s for an unknown repository', async () => {
    const cookie = await session();
    await seedRepo(REPO_ID, FULL_NAME);
    await seedAppAndInstallation();
    mockGitHubPulls();

    const response = await app.request(
      `${ORIGIN}/api/repositories/${REPO_ID}/pulls`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        number: 1,
        title: 'Fix the widget',
        headSha: HEAD_SHA,
        authorLogin: 'octocat',
        draft: false,
      },
      { number: 2, title: 'Draft idea', headSha: 'beef5678', authorLogin: null, draft: true },
    ]);

    const missing = await app.request(
      `${ORIGIN}/api/repositories/999/pulls`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(missing.status).toBe(404);
  });

  it("defaults the migration's new runs.mode column to auto", async () => {
    await env.DB.prepare(
      "INSERT INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status) VALUES ('legacy-run', 'legacy-delivery', 101, 1, 'sha', 'opened', 'completed')",
    ).run();
    const row = await env.DB.prepare('SELECT mode FROM runs WHERE id = ?')
      .bind('legacy-run')
      .first<{ mode: string }>();
    expect(row?.mode).toBe('auto');
  });
});
