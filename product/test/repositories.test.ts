import { env } from 'cloudflare:workers';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { createSession } from '../worker/lib/sessions';
import { resetInstanceState } from './db';
import { network } from './network';
import { ORIGIN, seedGitHubApp } from './webhook-helpers';

beforeEach(resetInstanceState);

async function session(): Promise<string> {
  const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
  return `jf_session=${id}`;
}

async function seedRepo(repoId: number, fullName: string, enabled: boolean): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO repositories (repo_id, full_name, private, enabled) VALUES (?, ?, 0, ?)',
  )
    .bind(repoId, fullName, enabled ? 1 : 0)
    .run();
}

async function seedReviewer(id: string, name: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO reviewers (id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
  )
    .bind(id, name, '', '', 'openai', 'https://api.example.com/v1', '', 'model-x', '{}')
    .run();
}

/** A session'd `GET /api/repositories?q=` read; asserts the 200 that every search case expects. */
async function listMatching(q: string, cookie: string) {
  const response = await app.request(
    `${ORIGIN}/api/repositories?q=${encodeURIComponent(q)}`,
    { headers: { Cookie: cookie } },
    env,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    repoId: number;
    fullName: string;
    private: boolean;
    enabled: boolean;
  }[];
}

describe('repositories api', () => {
  it('requires a session', async () => {
    const response = await app.request(`${ORIGIN}/api/repositories`, {}, env);
    expect(response.status).toBe(401);
  });

  it('lists repositories and toggles one', async () => {
    await seedRepo(101, 'octocat/hello', false);
    await seedRepo(202, 'octocat/zeta', true);
    const cookie = await session();

    const list = await app.request(
      `${ORIGIN}/api/repositories`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(list.status).toBe(200);
    const repositories = (await list.json()) as {
      repoId: number;
      fullName: string;
      enabled: boolean;
    }[];
    expect(repositories.map((repository) => repository.fullName)).toEqual([
      'octocat/hello',
      'octocat/zeta',
    ]);

    const enable = await app.request(
      `${ORIGIN}/api/repositories/101`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ enabled: true }),
      },
      env,
    );
    expect(enable.status).toBe(200);
    await expect(enable.json()).resolves.toMatchObject({ repoId: 101, enabled: true });

    const missing = await app.request(
      `${ORIGIN}/api/repositories/999`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ enabled: true }),
      },
      env,
    );
    expect(missing.status).toBe(404);

    const invalid = await app.request(
      `${ORIGIN}/api/repositories/101`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ enabled: 'yes' }),
      },
      env,
    );
    expect(invalid.status).toBe(400);

    const crossOrigin = await app.request(
      `${ORIGIN}/api/repositories/101`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
          Cookie: cookie,
        },
        body: JSON.stringify({ enabled: true }),
      },
      env,
    );
    expect(crossOrigin.status).toBe(403);
  });

  it('refreshes from GitHub, adding new repositories disabled', async () => {
    await seedGitHubApp();
    await env.DB.prepare(
      "INSERT INTO instance_meta (key, value) VALUES ('installation_id', '4242')",
    ).run();
    await seedRepo(101, 'octocat/old-name', true);
    const cookie = await session();

    network.use(
      http.post('https://api.github.com/app/installations/4242/access_tokens', () =>
        HttpResponse.json({ token: 'ghs_test', expires_at: '2099-01-01T00:00:00Z' }),
      ),
      http.get('https://api.github.com/installation/repositories', () =>
        HttpResponse.json({
          total_count: 2,
          repositories: [
            { id: 101, full_name: 'octocat/hello', private: false },
            { id: 303, full_name: 'octocat/fresh', private: true },
          ],
        }),
      ),
    );

    const response = await app.request(
      `${ORIGIN}/api/repositories?refresh=1`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const repositories = (await response.json()) as {
      repoId: number;
      fullName: string;
      enabled: boolean;
      private: boolean;
    }[];
    expect(repositories).toHaveLength(2);
    expect(repositories.find((repository) => repository.repoId === 101)).toMatchObject({
      fullName: 'octocat/hello',
      enabled: true,
    });
    expect(repositories.find((repository) => repository.repoId === 303)).toMatchObject({
      fullName: 'octocat/fresh',
      enabled: false,
      private: true,
    });
  });

  it('409s on refresh before setup', async () => {
    const cookie = await session();
    const response = await app.request(
      `${ORIGIN}/api/repositories?refresh=1`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(409);
  });

  it('manages per-repository reviewer toggles', async () => {
    await seedRepo(101, 'octocat/hello', true);
    await seedReviewer('rev-1', 'Security');
    await seedReviewer('rev-2', 'Architecture');
    const cookie = await session();

    const initial = await app.request(
      `${ORIGIN}/api/repositories/101/reviewers`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(initial.status).toBe(200);
    await expect(initial.json()).resolves.toEqual([
      {
        reviewerId: 'rev-2',
        name: 'Architecture',
        enabled: true,
        pathsInclude: [],
        pathsExclude: [],
        contextPaths: [],
      },
      {
        reviewerId: 'rev-1',
        name: 'Security',
        enabled: true,
        pathsInclude: [],
        pathsExclude: [],
        contextPaths: [],
      },
    ]);

    const saved = await app.request(
      `${ORIGIN}/api/repositories/101/reviewers`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ reviewers: [{ reviewerId: 'rev-1', enabled: false }] }),
      },
      env,
    );
    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toEqual([
      {
        reviewerId: 'rev-2',
        name: 'Architecture',
        enabled: true,
        pathsInclude: [],
        pathsExclude: [],
        contextPaths: [],
      },
      {
        reviewerId: 'rev-1',
        name: 'Security',
        enabled: false,
        pathsInclude: [],
        pathsExclude: [],
        contextPaths: [],
      },
    ]);

    const unknown = await app.request(
      `${ORIGIN}/api/repositories/101/reviewers`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ reviewers: [{ reviewerId: 'nope', enabled: true }] }),
      },
      env,
    );
    expect(unknown.status).toBe(400);

    const missingRepo = await app.request(
      `${ORIGIN}/api/repositories/999/reviewers`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(missingRepo.status).toBe(404);
  });

  it('round-trips a reviewer scope and keeps it when only the toggle is sent', async () => {
    await seedRepo(101, 'octocat/hello', true);
    await seedReviewer('rev-1', 'Documentation');
    const cookie = await session();

    const saved = await app.request(
      `${ORIGIN}/api/repositories/101/reviewers`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({
          reviewers: [
            {
              reviewerId: 'rev-1',
              enabled: true,
              pathsInclude: ['docs/**', '*.md'],
              pathsExclude: ['docs/legacy/**'],
              contextPaths: ['docs/'],
            },
          ],
        }),
      },
      env,
    );
    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toEqual([
      {
        reviewerId: 'rev-1',
        name: 'Documentation',
        enabled: true,
        pathsInclude: ['docs/**', '*.md'],
        pathsExclude: ['docs/legacy/**'],
        contextPaths: ['docs/'],
      },
    ]);

    // The toggle-only caller must not erase the scope.
    const toggled = await app.request(
      `${ORIGIN}/api/repositories/101/reviewers`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ reviewers: [{ reviewerId: 'rev-1', enabled: false }] }),
      },
      env,
    );
    expect(toggled.status).toBe(200);
    await expect(toggled.json()).resolves.toMatchObject([
      {
        reviewerId: 'rev-1',
        enabled: false,
        pathsInclude: ['docs/**', '*.md'],
        pathsExclude: ['docs/legacy/**'],
        contextPaths: ['docs/'],
      },
    ]);
  });

  it('previews patterns against the newest run that recorded changed files', async () => {
    await seedRepo(101, 'octocat/hello', true);
    const cookie = await session();
    const preview = (body: unknown) =>
      app.request(
        `${ORIGIN}/api/repositories/101/scope-preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
          body: JSON.stringify(body),
        },
        env,
      );

    const empty = await preview({ pathsInclude: ['docs/**'] });
    expect(empty.status).toBe(200);
    await expect(empty.json()).resolves.toEqual({
      runId: null,
      headSha: null,
      total: 0,
      matched: [],
    });

    await env.DB.prepare(
      "INSERT INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status, files_json, created_at) VALUES ('101:1:a:old', 'old', 101, 1, 'oldsha', 'synchronize', 'completed', ?, unixepoch() - 60)",
    )
      .bind(JSON.stringify(['README.md']))
      .run();
    await env.DB.prepare(
      "INSERT INTO runs (id, delivery_id, repo_id, pr_number, head_sha, event, status, files_json) VALUES ('101:2:b:new', 'new', 101, 2, 'newsha', 'synchronize', 'completed', ?)",
    )
      .bind(JSON.stringify(['docs/a.md', 'docs/legacy/b.md', 'src/app.ts']))
      .run();

    const matched = await preview({
      pathsInclude: ['docs/**'],
      pathsExclude: ['docs/legacy/**'],
    });
    expect(matched.status).toBe(200);
    await expect(matched.json()).resolves.toEqual({
      runId: '101:2:b:new',
      headSha: 'newsha',
      total: 3,
      matched: ['docs/a.md'],
    });

    const invalid = await preview({ pathsInclude: ['../outside/**'] });
    expect(invalid.status).toBe(400);
  });

  it('rejects an absolute or traversing scope pattern', async () => {
    await seedRepo(101, 'octocat/hello', true);
    await seedReviewer('rev-1', 'Documentation');
    const cookie = await session();

    for (const pattern of ['/etc/passwd', '../outside/**', 'docs/../../outside']) {
      const response = await app.request(
        `${ORIGIN}/api/repositories/101/reviewers`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
          body: JSON.stringify({
            reviewers: [{ reviewerId: 'rev-1', enabled: true, pathsInclude: [pattern] }],
          }),
        },
        env,
      );
      expect(response.status).toBe(400);
    }
  });

  it('matches a substring of the name, case-insensitively', async () => {
    await seedRepo(101, 'octocat/hello', false);
    await seedRepo(202, 'octocat/zeta', true);
    await seedRepo(303, 'AwesomeNPC/HelloWorld', false);
    const cookie = await session();
    const names = async (q: string) => (await listMatching(q, cookie)).map((row) => row.fullName);

    // A substring, not a prefix — and the case of the term and of the stored name both stop mattering.
    await expect(names('hello')).resolves.toEqual(['AwesomeNPC/HelloWorld', 'octocat/hello']);
    await expect(names('HelloWor')).resolves.toEqual(['AwesomeNPC/HelloWorld']);
    await expect(names('OCTOCAT')).resolves.toEqual(['octocat/hello', 'octocat/zeta']);
    // The term narrows the list; each surviving row keeps the flags it was stored with.
    await expect(listMatching('zeta', cookie)).resolves.toMatchObject([
      { repoId: 202, fullName: 'octocat/zeta', enabled: true },
    ]);
    // A blank term is no filter at all, exactly like an absent one.
    await expect(names('   ')).resolves.toEqual([
      'AwesomeNPC/HelloWorld',
      'octocat/hello',
      'octocat/zeta',
    ]);
  });

  it('treats % and _ in the term as literal characters', async () => {
    await seedRepo(101, 'octocat/my_repo', false);
    await seedRepo(202, 'octocat/myXrepo', true);
    const cookie = await session();
    const names = async (q: string) => (await listMatching(q, cookie)).map((row) => row.fullName);

    // `_` is LIKE's one-character wildcard: unescaped, `my_repo` would also answer `myXrepo`.
    await expect(names('my_repo')).resolves.toEqual(['octocat/my_repo']);
    // `%` matches anything: unescaped, each of these would return both rows instead of none.
    await expect(names('%')).resolves.toEqual([]);
    await expect(names('%repo')).resolves.toEqual([]);
    await expect(names('my%repo')).resolves.toEqual([]);
  });

  it('answers an empty list when nothing matches', async () => {
    await seedRepo(101, 'octocat/hello', false);
    const cookie = await session();

    const repositories = await listMatching('nothing-like-this', cookie);
    expect(repositories).toEqual([]);
  });

  it('refreshes from GitHub and narrows what it returns', async () => {
    await seedGitHubApp();
    await env.DB.prepare(
      "INSERT INTO instance_meta (key, value) VALUES ('installation_id', '4242')",
    ).run();
    const cookie = await session();

    network.use(
      http.post('https://api.github.com/app/installations/4242/access_tokens', () =>
        HttpResponse.json({ token: 'ghs_test', expires_at: '2099-01-01T00:00:00Z' }),
      ),
      http.get('https://api.github.com/installation/repositories', () =>
        HttpResponse.json({
          total_count: 2,
          repositories: [
            { id: 101, full_name: 'octocat/hello', private: false },
            { id: 303, full_name: 'octocat/fresh', private: true },
          ],
        }),
      ),
    );

    const response = await app.request(
      `${ORIGIN}/api/repositories?refresh=1&q=fresh`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const repositories = (await response.json()) as { fullName: string }[];
    // The sync still imports the whole installation; only the response is narrowed.
    expect(repositories.map((repository) => repository.fullName)).toEqual(['octocat/fresh']);
    const stored = await env.DB.prepare('SELECT COUNT(*) AS count FROM repositories').first<{
      count: number;
    }>();
    expect(stored?.count).toBe(2);
  });
});
