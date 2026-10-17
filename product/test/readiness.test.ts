import type { InstanceReadiness } from '@jury-forge/shared';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { computeReadiness } from '../worker/lib/readiness';
import { createSession } from '../worker/lib/sessions';
import { resetInstanceState } from './db';
import { ORIGIN } from './webhook-helpers';

beforeEach(resetInstanceState);

async function session(): Promise<string> {
  const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
  return `jf_session=${id}`;
}

async function seedMeta(key: string, value: string): Promise<void> {
  await env.DB.prepare('INSERT INTO instance_meta (key, value) VALUES (?, ?)')
    .bind(key, value)
    .run();
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
  await env.DB.prepare(
    'INSERT INTO reviewers (id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      name,
      '',
      '',
      'openai',
      'https://api.example.com/v1',
      options.withKey === false ? '' : 'v2.1.testkey',
      'model-x',
      '{}',
      options.enabled === false ? 0 : 1,
    )
    .run();
}

async function setPair(reviewerId: string, repoId: number, enabled: boolean): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO reviewer_repositories (reviewer_id, repo_id, enabled) VALUES (?, ?, ?)',
  )
    .bind(reviewerId, repoId, enabled ? 1 : 0)
    .run();
}

async function seedRun(
  id: string,
  status: 'running' | 'completed' | 'failed' | 'skipped',
  createdAt: number,
  mode: 'auto' | 'manual' = 'auto',
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status, created_at, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, `delivery-${id}`, 101, 1, 'sha', 'pull_request', status, createdAt, mode)
    .run();
}

describe('computeReadiness', () => {
  it('reports an empty instance as nothing done', async () => {
    const readiness = await computeReadiness(env.DB);
    expect(readiness.completed).toBe(0);
    expect(readiness.total).toBe(5);
    expect(readiness.nextStep.key).toBe('claim');
    expect(readiness.claimed).toBe(false);
    expect(readiness.appInstalled).toBe(false);
    expect(readiness.reposEnabled).toBe(0);
    expect(readiness.reviewersWithKey).toBe(0);
    expect(readiness.repoReviewerPairs).toBe(0);
    expect(readiness.firstRunAt).toBeNull();
    expect(readiness.steps.map((step) => step.key)).toEqual([
      'claim',
      'install-app',
      'enable-repo',
      'add-reviewer',
      'first-run',
    ]);
    expect(readiness.steps.every((step) => !step.done)).toBe(true);
  });

  it('points at the reviewer step once setup, install and one repository are done', async () => {
    await seedMeta('claimed_at', '1700000000');
    await seedMeta('installation_id', '4242');
    await seedRepo(101, 'octocat/hello', true);

    const readiness = await computeReadiness(env.DB);
    const seeded = { claimed: true, appInstalled: true, reposEnabled: 1, firstRunAt: null };
    const expectedCompleted = [
      seeded.claimed,
      seeded.appInstalled,
      seeded.reposEnabled > 0,
      readiness.reviewersWithKey > 0,
      seeded.firstRunAt !== null,
    ].filter(Boolean).length;

    expect(readiness.completed).toBe(expectedCompleted);
    expect(readiness.completed).toBe(3);
    expect(readiness.nextStep.key).toBe('add-reviewer');
    expect(readiness.reviewersWithKey).toBe(0);
    expect(readiness.steps.find((step) => step.key === 'add-reviewer')?.done).toBe(false);
  });

  it('counts only enabled reviewers that hold a key', async () => {
    await seedRepo(101, 'octocat/hello', true);
    await seedReviewer('rev-key', 'With key');
    await seedReviewer('rev-nokey', 'No key', { withKey: false });
    await seedReviewer('rev-off', 'Disabled', { enabled: false });

    const readiness = await computeReadiness(env.DB);
    expect(readiness.reviewersWithKey).toBe(1);
  });

  it('counts a reviewer/repository pair for every enabled pairing', async () => {
    await seedRepo(101, 'octocat/hello', true);
    await seedReviewer('rev-1', 'Security');

    await expect(computeReadiness(env.DB)).resolves.toMatchObject({ repoReviewerPairs: 1 });

    await seedReviewer('rev-off', 'Disabled', { enabled: false });
    await expect(computeReadiness(env.DB)).resolves.toMatchObject({ repoReviewerPairs: 1 });

    await seedRepo(202, 'octocat/zeta', false);
    await expect(computeReadiness(env.DB)).resolves.toMatchObject({ repoReviewerPairs: 1 });
  });

  it('drops a pair whose reviewer_repositories row is disabled', async () => {
    await seedRepo(101, 'octocat/hello', true);
    await seedRepo(202, 'octocat/zeta', true);
    await seedReviewer('rev-1', 'Security');
    await seedReviewer('rev-2', 'Architecture');
    await setPair('rev-1', 101, false);

    const readiness = await computeReadiness(env.DB);
    expect(readiness.repoReviewerPairs).toBe(3);
  });

  it('takes the earliest non-skipped run and ignores skipped runs', async () => {
    await seedRun('run-skipped', 'skipped', 100);
    await seedRun('run-late', 'completed', 300);
    await seedRun('run-early', 'failed', 200);

    const readiness = await computeReadiness(env.DB);
    expect(readiness.firstRunAt).toBe(200);
  });

  it('reports all five done with a closing next step', async () => {
    await seedMeta('claimed_at', '1700000000');
    await seedMeta('installation_id', '4242');
    await seedRepo(101, 'octocat/hello', true);
    await seedReviewer('rev-1', 'Security');
    await seedRun('run-1', 'completed', 200);

    const readiness = await computeReadiness(env.DB);
    expect(readiness.completed).toBe(5);
    expect(readiness.total).toBe(5);
    expect(readiness.steps.every((step) => step.done)).toBe(true);
    expect(readiness.nextStep).toEqual({
      key: 'done',
      title: 'Your jury is ready',
      body: 'Send a pull request on an enabled repository, or run a reviewer against an open one. Recent runs are one click away.',
      href: '/runs',
      label: 'View runs',
    });
  });

  it('counts a manual trial as the first run, and its closing copy claims no reviews', async () => {
    await seedMeta('claimed_at', '1700000000');
    await seedMeta('installation_id', '4242');
    await seedRepo(101, 'octocat/hello', true);
    await seedReviewer('rev-1', 'Security');
    await seedRun('run-trial', 'completed', 200, 'manual');

    const readiness = await computeReadiness(env.DB);
    // A trial is a run that finished and produced findings, so the fifth step is honestly done
    // (D-028 keeps `firstRunAt` = the earliest non-skipped run)...
    expect(readiness.firstRunAt).toBe(200);
    expect(readiness.completed).toBe(5);
    expect(readiness.nextStep.key).toBe('done');
    // ...but a trial posts nothing to GitHub, so the closing copy must not claim that the jury is
    // reviewing every repository and every pull request.
    expect(readiness.nextStep.title).not.toMatch(/reviewing/i);
    expect(readiness.nextStep.body).not.toMatch(/every enabled repository, every pull request/i);
    expect(readiness.nextStep.body).toMatch(/run a reviewer/i);
  });
});

describe('readiness api', () => {
  it('requires a session', async () => {
    const response = await app.request(`${ORIGIN}/api/instance/readiness`, {}, env);
    expect(response.status).toBe(401);
  });

  it('returns the computed readiness for the current rows', async () => {
    await seedMeta('claimed_at', '1700000000');
    await seedMeta('installation_id', '4242');
    await seedRepo(101, 'octocat/hello', true);
    await seedReviewer('rev-1', 'Security');
    const cookie = await session();

    const response = await app.request(
      `${ORIGIN}/api/instance/readiness`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as InstanceReadiness;
    const expected = await computeReadiness(env.DB);
    expect(body).toEqual(expected);
    expect(body.completed).toBe(4);
    expect(body.nextStep.key).toBe('first-run');
  });
});
