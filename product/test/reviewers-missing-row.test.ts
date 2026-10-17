import { ReviewerSchema } from '@jury-forge/shared';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { createSession } from '../worker/lib/sessions';
import { resetInstanceState } from './db';

const ORIGIN = 'https://jury-forge.test';

const INPUT = {
  name: 'Security',
  instructions: 'Hunt for injection and auth bugs.',
  rules: 'Block on leaked secrets.',
  flavor: 'openai',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-5',
  apiKey: 'sk-round-1-fixture-key',
  params: { temperature: 0.2 },
};

/** The read that selects the reviewer's own columns (`getReviewer`); not the lazy-rotation key read. */
function isReviewerRowRead(query: string): boolean {
  return query.includes('FROM reviewers WHERE id = ?') && query.includes('params_json');
}

/**
 * A D1 whose single-row reviewer read answers nothing, so the route's answer for a row that is not
 * there is what the test sees. This is the one path where the two sides of the boundary could
 * disagree: validating that response as `ReviewerSchema.nullable()` lets the Worker answer 201 with a
 * `null` body, and the dashboard's non-nullable `ReviewerSchema` can only call that
 * `invalid_response` — a request that "succeeded" and a screen that says the response was broken.
 *
 * `realReads` is how many of those reads the real D1 answers before the wrapper stops answering
 * them: 0 for a create (its only read follows the insert) and 1 for a patch (the existence check is
 * real, the read after the update is not). Everything else runs against the real `env.DB`.
 */
function dbWithoutReviewerRow(realReads: number): D1Database {
  let reads = 0;
  const real = env.DB;
  return {
    prepare(query: string) {
      if (!isReviewerRowRead(query)) {
        return real.prepare(query);
      }
      reads += 1;
      if (reads > realReads) {
        // `getReviewer` only ever calls `bind(...).first()` on this statement.
        return { bind: () => ({ first: async () => null }) } as unknown as D1PreparedStatement;
      }
      return real.prepare(query);
    },
    batch: real.batch.bind(real),
    exec: real.exec.bind(real),
    dump: real.dump.bind(real),
  } as unknown as D1Database;
}

beforeEach(resetInstanceState);

async function session(): Promise<string> {
  const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
  return `jf_session=${id}`;
}

async function requestJson(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
  db: D1Database = env.DB,
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
    { ...env, DB: db },
  );
}

async function create(cookie: string): Promise<{ id: string }> {
  const response = await requestJson(cookie, 'POST', '', INPUT);
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string };
}

describe('reviewer responses when the row is not there', () => {
  it('answers 500 internal_error for a create whose row does not come back', async () => {
    const cookie = await session();

    const response = await requestJson(cookie, 'POST', '', INPUT, dbWithoutReviewerRow(0));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal_error' });
  });

  it('answers 500 internal_error for an update whose row does not come back', async () => {
    const cookie = await session();
    const reviewer = await create(cookie);

    const response = await requestJson(
      cookie,
      'PATCH',
      `/${reviewer.id}`,
      { name: 'Renamed' },
      dbWithoutReviewerRow(1),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal_error' });
  });

  it('keeps the 201 body a reviewer the dashboard schema parses', async () => {
    const cookie = await session();

    const response = await requestJson(cookie, 'POST', '', INPUT);
    const body: unknown = await response.json();

    expect(response.status).toBe(201);
    expect(body).not.toBeNull();
    expect(ReviewerSchema.safeParse(body).success).toBe(true);
  });
});
