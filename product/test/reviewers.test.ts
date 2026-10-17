import { env } from 'cloudflare:workers';
import type { ReviewersExportDocument } from '@jury-forge/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { decryptSecret, encryptSecret, loadKeyRing } from '../worker/lib/crypto';
import { createSession } from '../worker/lib/sessions';
import { resetInstanceState } from './db';

const ORIGIN = 'https://jury-forge.test';
const CURRENT_KEY = btoa(String.fromCharCode(7).repeat(32));
const PREVIOUS_KEY = btoa(String.fromCharCode(9).repeat(32));

beforeEach(resetInstanceState);

async function session(): Promise<string> {
  const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
  return `jf_session=${id}`;
}

const INPUT = {
  name: 'Security',
  instructions: 'Hunt for injection and auth bugs.',
  rules: 'Block on leaked secrets.',
  flavor: 'openai',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-5',
  apiKey: 'sk-test-secret',
  params: { temperature: 0.2 },
};

/** Seeds a reviewer whose stored API key was wrapped under the previous key version. */
async function seedReviewerWithStoredKey(
  id: string,
  name: string,
  plaintext: string,
): Promise<void> {
  const previousRing = await loadKeyRing({ key: PREVIOUS_KEY, version: '0' });
  await env.DB.prepare(
    "INSERT INTO reviewers (id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled) VALUES (?, ?, '', '', 'openai', 'https://api.example.com/v1', ?, 'model-x', '{}', 1)",
  )
    .bind(id, name, await encryptSecret(previousRing, plaintext))
    .run();
}

async function post(cookie: string, body: unknown): Promise<Response> {
  return app.request(
    `${ORIGIN}/api/reviewers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function create(
  cookie: string,
  body: unknown = INPUT,
): Promise<{ id: string } & Record<string, unknown>> {
  const response = await post(cookie, body);
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string } & Record<string, unknown>;
}

interface ReviewerRowFields {
  name: string;
  instructions: string;
  rules: string;
  flavor: string;
  base_url: string;
  model: string;
  params_json: string;
  enabled: number;
  api_key_enc: string;
}

async function requestJson(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return app.request(
    `${ORIGIN}/api/reviewers${path}`,
    {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        Origin: ORIGIN,
        Cookie: cookie,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}

describe('reviewers api', () => {
  it('requires a session', async () => {
    const response = await app.request(`${ORIGIN}/api/reviewers`, {}, env);
    expect(response.status).toBe(401);
  });

  it('creates a reviewer and never returns the API key', async () => {
    const cookie = await session();
    const reviewer = await create(cookie);
    expect(reviewer.name).toBe('Security');
    expect(reviewer.flavor).toBe('openai');
    expect(reviewer.baseUrl).toBe('https://api.example.com/v1');
    expect(reviewer.model).toBe('gpt-5');
    expect(reviewer.params).toEqual({ temperature: 0.2 });
    expect(reviewer.enabled).toBe(true);
    expect(reviewer.hasApiKey).toBe(true);
    expect(reviewer).not.toHaveProperty('apiKey');
    expect(reviewer).not.toHaveProperty('api_key_enc');

    const row = await env.DB.prepare('SELECT api_key_enc FROM reviewers WHERE id = ?')
      .bind(reviewer.id)
      .first<{ api_key_enc: string }>();
    expect(row?.api_key_enc).toMatch(/^v2\.1\./);
    expect(row?.api_key_enc).not.toContain('sk-test-secret');
  });

  it('creates a reviewer without an API key', async () => {
    const cookie = await session();
    const withoutKey: Record<string, unknown> = { ...INPUT };
    delete withoutKey.apiKey;
    const reviewer = await create(cookie, withoutKey);
    expect(reviewer.hasApiKey).toBe(false);
    const row = await env.DB.prepare('SELECT api_key_enc FROM reviewers WHERE id = ?')
      .bind(reviewer.id)
      .first<{ api_key_enc: string }>();
    expect(row?.api_key_enc).toBe('');
  });

  it('lists reviewers alphabetically without secrets', async () => {
    const cookie = await session();
    await create(cookie, { ...INPUT, name: 'Zeta' });
    await create(cookie, { ...INPUT, name: 'alpha' });
    const response = await app.request(
      `${ORIGIN}/api/reviewers`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const list = (await response.json()) as { name: string; hasApiKey: boolean }[];
    expect(list.map((entry) => entry.name)).toEqual(['alpha', 'Zeta']);
    expect(list.every((entry) => entry.hasApiKey)).toBe(true);
    expect(JSON.stringify(list)).not.toContain('sk-test-secret');
  });

  it('updates a reviewer and replaces or clears the key', async () => {
    const cookie = await session();
    const reviewer = await create(cookie);
    const patch = async (body: unknown): Promise<Response> =>
      app.request(
        `${ORIGIN}/api/reviewers/${reviewer.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
          body: JSON.stringify(body),
        },
        env,
      );

    const renamed = await patch({ name: 'Security v2', enabled: false });
    expect(renamed.status).toBe(200);
    const renamedBody = (await renamed.json()) as {
      name: string;
      enabled: boolean;
      hasApiKey: boolean;
    };
    expect(renamedBody.name).toBe('Security v2');
    expect(renamedBody.enabled).toBe(false);
    expect(renamedBody.hasApiKey).toBe(true);

    const cleared = await patch({ apiKey: null });
    const clearedBody = (await cleared.json()) as { hasApiKey: boolean };
    expect(clearedBody.hasApiKey).toBe(false);
  });

  it('rejects invalid input', async () => {
    const cookie = await session();
    const invalidInputs = [
      { ...INPUT, name: '' },
      { ...INPUT, flavor: 'gemini' },
      { ...INPUT, baseUrl: 'not a url' },
    ];
    for (const invalid of invalidInputs) {
      const response = await post(cookie, invalid);
      expect(response.status).toBe(400);
    }
  });

  it('rejects cross-origin mutations', async () => {
    const cookie = await session();
    const response = await app.request(
      `${ORIGIN}/api/reviewers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
          Cookie: cookie,
        },
        body: JSON.stringify(INPUT),
      },
      env,
    );
    expect(response.status).toBe(403);
  });

  it('reads and deletes a reviewer', async () => {
    const cookie = await session();
    const reviewer = await create(cookie);

    const fetched = await app.request(
      `${ORIGIN}/api/reviewers/${reviewer.id}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(fetched.status).toBe(200);

    const missing = await app.request(
      `${ORIGIN}/api/reviewers/unknown`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(missing.status).toBe(404);

    const deleted = await app.request(
      `${ORIGIN}/api/reviewers/${reviewer.id}`,
      { method: 'DELETE', headers: { Origin: ORIGIN, Cookie: cookie } },
      env,
    );
    expect(deleted.status).toBe(204);

    const gone = await app.request(
      `${ORIGIN}/api/reviewers/${reviewer.id}`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(gone.status).toBe(404);
  });

  it('re-wraps a key held under the previous version on PATCH and records the rotation', async () => {
    const cookie = await session();
    await seedReviewerWithStoredKey('rev-rotate', 'Rotating', 'sk-rotate-me');

    const before = await env.DB.prepare('SELECT api_key_enc FROM reviewers WHERE id = ?')
      .bind('rev-rotate')
      .first<{ api_key_enc: string }>();
    expect(before?.api_key_enc).toMatch(/^v2\.0\./);

    const response = await app.request(
      `${ORIGIN}/api/reviewers/rev-rotate`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ name: 'Rotated' }),
      },
      env,
    );
    expect(response.status).toBe(200);

    const after = await env.DB.prepare('SELECT name, api_key_enc FROM reviewers WHERE id = ?')
      .bind('rev-rotate')
      .first<{ name: string; api_key_enc: string }>();
    expect(after?.name).toBe('Rotated');
    expect(after?.api_key_enc).toMatch(/^v2\.1\./);
    const ring = await loadKeyRing({ key: CURRENT_KEY });
    await expect(decryptSecret(ring, after?.api_key_enc ?? '')).resolves.toBe('sk-rotate-me');

    const rotations = await env.DB.prepare(
      "SELECT target, detail FROM activity_log WHERE action = 'credential_rotation'",
    ).all<{ target: string; detail: string }>();
    expect(rotations.results).toHaveLength(1);
    expect(rotations.results[0]?.target).toBe('Rotated');
    expect(rotations.results[0]?.detail).toBe('api_key re-wrapped for key version 1');

    const update = await env.DB.prepare(
      "SELECT detail FROM activity_log WHERE action = 'reviewer_update'",
    ).first<{ detail: string }>();
    expect(update?.detail).toContain('api_key: re-wrapped');
  });

  it('does not rotate when the PATCH sets an API key', async () => {
    const cookie = await session();
    await seedReviewerWithStoredKey('rev-set', 'Setting', 'sk-old');

    const response = await app.request(
      `${ORIGIN}/api/reviewers/rev-set`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ apiKey: 'sk-new' }),
      },
      env,
    );
    expect(response.status).toBe(200);

    const rotations = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM activity_log WHERE action = 'credential_rotation'",
    ).first<{ count: number }>();
    expect(rotations?.count).toBe(0);

    const row = await env.DB.prepare('SELECT api_key_enc FROM reviewers WHERE id = ?')
      .bind('rev-set')
      .first<{ api_key_enc: string }>();
    const ring = await loadKeyRing({ key: CURRENT_KEY });
    await expect(decryptSecret(ring, row?.api_key_enc ?? '')).resolves.toBe('sk-new');
  });
});

describe('reviewer import/export', () => {
  it('exports definitions without keys or ciphertext and round-trips into an import', async () => {
    const cookie = await session();
    await create(cookie);

    const response = await requestJson(cookie, 'GET', '/export');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="jury-forge-reviewers.json"',
    );
    const document = (await response.json()) as ReviewersExportDocument;
    expect(document.version).toBe(1);
    expect(typeof document.exportedAt).toBe('number');
    expect(document.reviewers).toHaveLength(1);
    const entry = document.reviewers[0] as unknown as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual([
      'baseUrl',
      'enabled',
      'flavor',
      'instructions',
      'model',
      'name',
      'params',
      'rules',
    ]);
    expect(entry).not.toHaveProperty('apiKey');
    expect(entry).not.toHaveProperty('hasApiKey');
    expect(JSON.stringify(document)).not.toContain('sk-test-secret');

    const imported = await requestJson(cookie, 'POST', '/import', document);
    expect(imported.status).toBe(200);
    await expect(imported.json()).resolves.toEqual({
      created: 0,
      updated: 0,
      unchanged: 1,
      skipped: 0,
    });
  });

  it('creates a new reviewer from an import with no API key', async () => {
    const cookie = await session();
    const response = await requestJson(cookie, 'POST', '/import', {
      version: 1,
      reviewers: [
        {
          name: 'Imported',
          instructions: 'Check things.',
          rules: '',
          flavor: 'anthropic',
          baseUrl: 'https://api.anthropic.example/v1',
          model: 'claude-x',
          params: { temperature: 0.5 },
          enabled: false,
        },
      ],
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      created: 1,
      updated: 0,
      unchanged: 0,
      skipped: 0,
    });

    const row = await env.DB.prepare(
      'SELECT instructions, flavor, enabled, api_key_enc FROM reviewers WHERE name = ?',
    )
      .bind('Imported')
      .first<Pick<ReviewerRowFields, 'instructions' | 'flavor' | 'enabled' | 'api_key_enc'>>();
    expect(row?.instructions).toBe('Check things.');
    expect(row?.flavor).toBe('anthropic');
    expect(row?.enabled).toBe(0);
    expect(row?.api_key_enc).toBe('');
  });

  it('updates an existing reviewer field by field and keeps its stored key', async () => {
    const cookie = await session();
    const reviewer = await create(cookie);
    const before = await env.DB.prepare('SELECT api_key_enc FROM reviewers WHERE id = ?')
      .bind(reviewer.id)
      .first<{ api_key_enc: string }>();

    const response = await requestJson(cookie, 'POST', '/import', {
      version: 1,
      reviewers: [
        {
          name: 'security', // case-insensitive merge with the stored "Security"
          instructions: 'Updated instructions.',
          rules: 'Updated rules.',
          flavor: 'anthropic',
          baseUrl: 'https://api.anthropic.example/v1',
          model: 'claude-y',
          params: { temperature: 0.9 },
          enabled: false,
        },
      ],
    });
    await expect(response.json()).resolves.toEqual({
      created: 0,
      updated: 1,
      unchanged: 0,
      skipped: 0,
    });

    const after = await env.DB.prepare(
      'SELECT name, instructions, rules, flavor, base_url, model, params_json, enabled, api_key_enc FROM reviewers WHERE id = ?',
    )
      .bind(reviewer.id)
      .first<ReviewerRowFields>();
    expect(after?.name).toBe('security');
    expect(after?.instructions).toBe('Updated instructions.');
    expect(after?.rules).toBe('Updated rules.');
    expect(after?.flavor).toBe('anthropic');
    expect(after?.base_url).toBe('https://api.anthropic.example/v1');
    expect(after?.model).toBe('claude-y');
    expect(JSON.parse(after?.params_json ?? '{}')).toEqual({ temperature: 0.9 });
    expect(after?.enabled).toBe(0);
    expect(after?.api_key_enc).toBe(before?.api_key_enc);
    expect(after?.api_key_enc).toMatch(/^v2\.1\./);

    const fetched = await app.request(
      `${ORIGIN}/api/reviewers/${reviewer.id}`,
      { headers: { Cookie: cookie } },
      env,
    );
    const body = (await fetched.json()) as { hasApiKey: boolean };
    expect(body.hasApiKey).toBe(true);
  });

  it('counts an identical document as unchanged', async () => {
    const cookie = await session();
    await create(cookie, { ...INPUT, name: 'One' });
    await create(cookie, { ...INPUT, name: 'Two' });
    const document = (await (
      await requestJson(cookie, 'GET', '/export')
    ).json()) as ReviewersExportDocument;

    const response = await requestJson(cookie, 'POST', '/import', document);
    await expect(response.json()).resolves.toEqual({
      created: 0,
      updated: 0,
      unchanged: 2,
      skipped: 0,
    });
  });

  it('skips a blank name and writes nothing for it', async () => {
    const cookie = await session();
    const response = await requestJson(cookie, 'POST', '/import', {
      version: 1,
      reviewers: [
        { name: '   ', flavor: 'openai', baseUrl: 'https://api.example.com/v1', model: 'gpt-5' },
        { name: 'Kept', flavor: 'openai', baseUrl: 'https://api.example.com/v1', model: 'gpt-5' },
      ],
    });
    await expect(response.json()).resolves.toEqual({
      created: 1,
      updated: 0,
      unchanged: 0,
      skipped: 1,
    });
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM reviewers').first<{
      count: number;
    }>();
    expect(count?.count).toBe(1);
  });

  it('rejects a bad version or out-of-bounds fields with 400', async () => {
    const cookie = await session();
    const base = {
      name: 'X',
      flavor: 'openai',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-5',
    };
    const documents = [
      { version: 2, reviewers: [base] },
      { version: 1, reviewers: [{ ...base, instructions: 'x'.repeat(20_001) }] },
      { version: 1, reviewers: [{ ...base, name: 'x'.repeat(121) }] },
      { version: 1, reviewers: [{ ...base, model: 'x'.repeat(201) }] },
    ];
    for (const document of documents) {
      const response = await requestJson(cookie, 'POST', '/import', document);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'invalid_request' });
    }
  });

  it('rejects more than 100 reviewers with 400', async () => {
    const cookie = await session();
    const reviewers = Array.from({ length: 101 }, (_value, index) => ({
      name: `R${index}`,
      flavor: 'openai',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-5',
    }));
    const response = await requestJson(cookie, 'POST', '/import', { version: 1, reviewers });
    expect(response.status).toBe(400);
  });

  it('ignores an apiKey field carried by an imported entry', async () => {
    const cookie = await session();
    const response = await requestJson(cookie, 'POST', '/import', {
      version: 1,
      reviewers: [
        {
          name: 'Keyless',
          flavor: 'openai',
          baseUrl: 'https://api.example.com/v1',
          model: 'gpt-5',
          apiKey: 'sk-should-not-be-stored',
        },
      ],
    });
    expect(response.status).toBe(200);
    const row = await env.DB.prepare('SELECT api_key_enc FROM reviewers WHERE name = ?')
      .bind('Keyless')
      .first<{ api_key_enc: string }>();
    expect(row?.api_key_enc).toBe('');
  });

  it('records a reviewer_import activity row', async () => {
    const cookie = await session();
    await requestJson(cookie, 'POST', '/import', {
      version: 1,
      reviewers: [
        {
          name: 'Logged',
          flavor: 'openai',
          baseUrl: 'https://api.example.com/v1',
          model: 'gpt-5',
        },
      ],
    });
    const row = await env.DB.prepare(
      "SELECT actor, action, target, detail FROM activity_log WHERE action = 'reviewer_import'",
    ).first<{ actor: string; action: string; target: string | null; detail: string | null }>();
    expect(row).toEqual({
      actor: 'octocat',
      action: 'reviewer_import',
      target: null,
      detail: 'created 1, updated 0, unchanged 0, skipped 0',
    });
  });
});

describe('reviewer repository visibility', () => {
  async function seedRepo(repoId: number, fullName: string, enabled = true): Promise<void> {
    await env.DB.prepare(
      'INSERT INTO repositories (repo_id, full_name, private, enabled) VALUES (?, ?, 0, ?)',
    )
      .bind(repoId, fullName, enabled ? 1 : 0)
      .run();
  }

  async function seedReviewerRow(id: string, name: string): Promise<void> {
    await env.DB.prepare(
      "INSERT INTO reviewers (id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled) VALUES (?, ?, '', '', 'openai', 'https://api.example.com/v1', '', 'model-x', '{}', 1)",
    )
      .bind(id, name)
      .run();
  }

  async function list(cookie: string): Promise<{ id: string; repositories: string[] }[]> {
    const response = await app.request(
      `${ORIGIN}/api/reviewers`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    return (await response.json()) as { id: string; repositories: string[] }[];
  }

  it('carries the enabled repositories a reviewer will run on', async () => {
    const cookie = await session();
    await seedRepo(101, 'octocat/hello');
    await seedRepo(202, 'octocat/zeta');
    await seedRepo(303, 'octocat/hidden', false);
    await seedReviewerRow('rev-1', 'Security');

    const reviewers = await list(cookie);
    expect(reviewers.find((reviewer) => reviewer.id === 'rev-1')?.repositories).toEqual([
      'octocat/hello',
      'octocat/zeta',
    ]);
    expect(JSON.stringify(reviewers)).not.toContain('octocat/hidden');
  });

  it('removes a disabled pair from that reviewer only', async () => {
    const cookie = await session();
    await seedRepo(101, 'octocat/hello');
    await seedRepo(202, 'octocat/zeta');
    await seedReviewerRow('rev-1', 'Security');
    await seedReviewerRow('rev-2', 'Architecture');
    await env.DB.prepare(
      'INSERT INTO reviewer_repositories (reviewer_id, repo_id, enabled) VALUES (?, ?, 0)',
    )
      .bind('rev-1', 101)
      .run();

    const reviewers = await list(cookie);
    expect(reviewers.find((reviewer) => reviewer.id === 'rev-1')?.repositories).toEqual([
      'octocat/zeta',
    ]);
    expect(reviewers.find((reviewer) => reviewer.id === 'rev-2')?.repositories).toEqual([
      'octocat/hello',
      'octocat/zeta',
    ]);
  });

  it('gives a reviewer with no enabled repository an empty list', async () => {
    const cookie = await session();
    await seedRepo(101, 'octocat/hello', false);
    await seedReviewerRow('rev-alone', 'Alone');

    const reviewers = await list(cookie);
    expect(reviewers.find((reviewer) => reviewer.id === 'rev-alone')?.repositories).toEqual([]);
  });

  it('returns the same list when reading one reviewer', async () => {
    const cookie = await session();
    await seedRepo(101, 'octocat/hello');
    await seedRepo(202, 'octocat/zeta');
    await seedReviewerRow('rev-1', 'Security');

    const response = await app.request(
      `${ORIGIN}/api/reviewers/rev-1`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const reviewer = (await response.json()) as { repositories: string[] };
    expect(reviewer.repositories).toEqual(['octocat/hello', 'octocat/zeta']);
  });
});
