import { env } from 'cloudflare:workers';
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
