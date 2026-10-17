import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import {
  ACTIVITY_RETENTION_DAYS,
  listActivity,
  parseActivityCursor,
  recordActivity,
} from '../worker/lib/activity';
import { createSession } from '../worker/lib/sessions';
import { resetInstanceState } from './db';

const ORIGIN = 'https://jury-forge.test';
const DAY_SECONDS = 86_400;

beforeEach(resetInstanceState);

async function session(): Promise<string> {
  const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
  return `jf_session=${id}`;
}

async function insertActivity(at: number, action: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO activity_log (at, actor, action, target, detail) VALUES (?, ?, ?, NULL, NULL)',
  )
    .bind(at, 'octocat', action)
    .run();
}

describe('recordActivity', () => {
  it('inserts a row', async () => {
    await recordActivity(env.DB, { actor: 'octocat', action: 'sign_in', detail: 'login' });
    const row = await env.DB.prepare(
      'SELECT actor, action, target, detail FROM activity_log',
    ).first<{ actor: string; action: string; target: string | null; detail: string | null }>();
    expect(row).toEqual({ actor: 'octocat', action: 'sign_in', target: null, detail: 'login' });
  });

  it('swallows a failed insert', async () => {
    const brokenDb = {
      prepare() {
        throw new Error('boom');
      },
    } as unknown as D1Database;
    await expect(
      recordActivity(brokenDb, { actor: 'octocat', action: 'sign_in' }),
    ).resolves.toBeUndefined();
  });
});

describe('listActivity', () => {
  it('returns the newest first with a keyset cursor and honours the limit', async () => {
    const now = Math.floor(Date.now() / 1_000);
    await insertActivity(now - 300, 'a');
    await insertActivity(now - 300, 'b');
    await insertActivity(now - 100, 'c');

    const first = await listActivity(env.DB, { limit: 2 });
    expect(first.activity.map((entry) => entry.action)).toEqual(['c', 'b']);
    expect(first.nextCursor).not.toBeNull();

    const second = await listActivity(env.DB, { limit: 2, cursor: first.nextCursor ?? '' });
    expect(second.activity.map((entry) => entry.action)).toEqual(['a']);
    expect(second.nextCursor).toBeNull();
  });

  it('prunes rows older than the retention window on read', async () => {
    const now = Math.floor(Date.now() / 1_000);
    await insertActivity(now - ACTIVITY_RETENTION_DAYS * DAY_SECONDS - 10, 'old');
    await insertActivity(now, 'fresh');

    const page = await listActivity(env.DB, { limit: 10 });
    expect(page.activity.map((entry) => entry.action)).toEqual(['fresh']);

    const remaining = await env.DB.prepare('SELECT COUNT(*) AS count FROM activity_log').first<{
      count: number;
    }>();
    expect(remaining?.count).toBe(1);
  });

  it('parses only well-formed cursors', () => {
    expect(parseActivityCursor('nope')).toBeNull();
    expect(parseActivityCursor('1:')).toBeNull();
    expect(parseActivityCursor(':2')).toBeNull();
    expect(parseActivityCursor('x:2')).toBeNull();
    expect(parseActivityCursor('1:2')).toEqual({ at: 1, id: 2 });
  });
});

describe('activity api', () => {
  it('requires a session', async () => {
    const response = await app.request(`${ORIGIN}/api/activity`, {}, env);
    expect(response.status).toBe(401);
  });

  it('returns the trail newest first and 400s on a malformed cursor', async () => {
    const now = Math.floor(Date.now() / 1_000);
    await insertActivity(now - 200, 'older');
    await insertActivity(now - 100, 'newer');
    const cookie = await session();

    const response = await app.request(
      `${ORIGIN}/api/activity?limit=10`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      activity: { action: string }[];
      nextCursor: string | null;
    };
    expect(body.activity.map((entry) => entry.action)).toEqual(['newer', 'older']);
    expect(body.nextCursor).toBeNull();

    const bad = await app.request(
      `${ORIGIN}/api/activity?cursor=nope`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toEqual({ error: 'invalid_request' });
  });
});
