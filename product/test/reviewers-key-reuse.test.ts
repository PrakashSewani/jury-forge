import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { createSession } from '../worker/lib/sessions';
import { resetInstanceState } from './db';

const ORIGIN = 'https://jury-forge.test';
const HEADERS = { 'Content-Type': 'application/json', Origin: ORIGIN };

beforeEach(resetInstanceState);

async function session(): Promise<string> {
  const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
  return `jf_session=${id}`;
}

const DEFINITION = {
  name: 'Security',
  instructions: 'Hunt for injection and auth bugs.',
  rules: 'Block on leaked secrets.',
  flavor: 'openai',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-5',
  params: { temperature: 0.2 },
};

async function post(cookie: string, body: unknown, target: typeof env = env): Promise<Response> {
  return app.request(
    `${ORIGIN}/api/reviewers`,
    {
      method: 'POST',
      headers: { ...HEADERS, Cookie: cookie },
      body: JSON.stringify(body),
    },
    target,
  );
}

async function patch(
  cookie: string,
  id: string,
  body: unknown,
  target: typeof env = env,
): Promise<Response> {
  return app.request(
    `${ORIGIN}/api/reviewers/${id}`,
    {
      method: 'PATCH',
      headers: { ...HEADERS, Cookie: cookie },
      body: JSON.stringify(body),
    },
    target,
  );
}

interface ReviewerBody {
  id: string;
  name: string;
  hasApiKey: boolean;
}

async function createReviewer(
  cookie: string,
  body: unknown,
  target: typeof env = env,
): Promise<ReviewerBody> {
  const response = await post(cookie, body, target);
  expect(response.status).toBe(201);
  return (await response.json()) as ReviewerBody;
}

/** The stored ciphertext exactly as the row holds it — never a decrypted value. */
async function ciphertextOf(id: string): Promise<string> {
  const row = await env.DB.prepare('SELECT api_key_enc FROM reviewers WHERE id = ?')
    .bind(id)
    .first<{ api_key_enc: string }>();
  return row?.api_key_enc ?? '';
}

async function reviewerCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM reviewers').first<{
    count: number;
  }>();
  return row?.count ?? 0;
}

async function errorCode(response: Response): Promise<unknown> {
  return ((await response.json()) as { error?: unknown }).error;
}

describe('reusing a stored model key', () => {
  it('copies the source reviewer ciphertext verbatim on create', async () => {
    const cookie = await session();
    const source = await createReviewer(cookie, { ...DEFINITION, apiKey: 'sk-source-secret' });
    const sourceCiphertext = await ciphertextOf(source.id);
    expect(sourceCiphertext.startsWith('v2.1.')).toBe(true);

    const reused = await createReviewer(cookie, {
      ...DEFINITION,
      name: 'Security (reused)',
      apiKeyFromReviewerId: source.id,
    });

    expect(reused.hasApiKey).toBe(true);
    // Byte for byte and not re-wrapped under a fresh nonce: the source row's ciphertext is the only
    // key material involved, and nothing decrypted it.
    const reusedCiphertext = await ciphertextOf(reused.id);
    expect(reusedCiphertext).toBe(sourceCiphertext);
    expect(reusedCiphertext).not.toBe('');
    // The response carries no key and no ciphertext, and never the plaintext either.
    expect(reused).not.toHaveProperty('apiKey');
    expect(reused).not.toHaveProperty('api_key_enc');
    expect(JSON.stringify(reused)).not.toContain('sk-source-secret');
  });

  it('copies the source reviewer ciphertext verbatim on update', async () => {
    const cookie = await session();
    const source = await createReviewer(cookie, { ...DEFINITION, apiKey: 'sk-source-secret' });
    const sourceCiphertext = await ciphertextOf(source.id);
    const target = await createReviewer(cookie, { ...DEFINITION, name: 'Target' });
    expect(await ciphertextOf(target.id)).toBe('');

    const response = await patch(cookie, target.id, { apiKeyFromReviewerId: source.id });
    expect(response.status).toBe(200);
    const body = (await response.json()) as ReviewerBody;
    expect(body.hasApiKey).toBe(true);
    expect(await ciphertextOf(target.id)).toBe(sourceCiphertext);

    // The trail says a key was reused, and names no key material.
    const activity = await env.DB.prepare(
      "SELECT detail FROM activity_log WHERE action = 'reviewer_update' ORDER BY at DESC, id DESC",
    ).first<{ detail: string }>();
    expect(activity?.detail).toContain('api_key: reused from another reviewer');
  });

  it('refuses a reviewer that does not exist with a defined 400', async () => {
    const cookie = await session();
    const response = await post(cookie, {
      ...DEFINITION,
      apiKeyFromReviewerId: 'rev-does-not-exist',
    });
    expect(response.status).toBe(400);
    await expect(errorCode(response)).resolves.toBe('invalid_request');
    expect(await reviewerCount()).toBe(0);
  });

  it('refuses a source reviewer that holds no key with a defined 400', async () => {
    const cookie = await session();
    const keyless = await createReviewer(cookie, { ...DEFINITION, name: 'No key' });
    expect(keyless.hasApiKey).toBe(false);

    const response = await post(cookie, {
      ...DEFINITION,
      name: 'Reused from a keyless reviewer',
      apiKeyFromReviewerId: keyless.id,
    });
    expect(response.status).toBe(400);
    await expect(errorCode(response)).resolves.toBe('invalid_request');
    expect(await reviewerCount()).toBe(1);

    const update = await patch(cookie, keyless.id, { apiKeyFromReviewerId: keyless.id });
    expect(update.status).toBe(400);
    await expect(errorCode(update)).resolves.toBe('invalid_request');
  });

  it('refuses apiKey and apiKeyFromReviewerId together with a defined 400', async () => {
    const cookie = await session();
    const source = await createReviewer(cookie, { ...DEFINITION, apiKey: 'sk-source-secret' });
    const before = await reviewerCount();
    const sourceCiphertext = await ciphertextOf(source.id);

    const created = await post(cookie, {
      ...DEFINITION,
      apiKey: 'sk-both',
      apiKeyFromReviewerId: source.id,
    });
    expect(created.status).toBe(400);
    await expect(errorCode(created)).resolves.toBe('invalid_request');

    const updated = await patch(cookie, source.id, {
      apiKey: 'sk-both',
      apiKeyFromReviewerId: source.id,
    });
    expect(updated.status).toBe(400);
    await expect(errorCode(updated)).resolves.toBe('invalid_request');

    // Neither attempt wrote anything: no row was added, and the source keeps its own ciphertext.
    expect(await reviewerCount()).toBe(before);
    expect(await ciphertextOf(source.id)).toBe(sourceCiphertext);
  });

  it('still refuses with encryption_key_unset when ENCRYPTION_KEY is unset', async () => {
    const cookie = await session();
    const source = await createReviewer(cookie, { ...DEFINITION, apiKey: 'sk-source-secret' });
    const withoutKey = { ...env, ENCRYPTION_KEY: undefined } as typeof env;

    const created = await post(
      cookie,
      { ...DEFINITION, apiKeyFromReviewerId: source.id },
      withoutKey,
    );
    expect(created.status).toBe(500);
    await expect(errorCode(created)).resolves.toBe('encryption_key_unset');

    const updated = await patch(cookie, source.id, { apiKeyFromReviewerId: source.id }, withoutKey);
    expect(updated.status).toBe(500);
    await expect(errorCode(updated)).resolves.toBe('encryption_key_unset');
  });
});
