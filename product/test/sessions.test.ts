import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../worker/lib/crypto';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  readSession,
  sessionCookie,
  sessionIdFromCookie,
} from '../worker/lib/sessions';

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM sessions').run();
});

describe('sessions', () => {
  it('creates, reads, and deletes a session', async () => {
    const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
    await expect(readSession(env.DB, id)).resolves.toEqual({ login: 'octocat', avatarUrl: null });
    await deleteSession(env.DB, id);
    await expect(readSession(env.DB, id)).resolves.toBeNull();
  });

  it('returns null for unknown and expired sessions', async () => {
    await expect(readSession(env.DB, 'missing')).resolves.toBeNull();
    await insertSession('expired-token', 1);
    await expect(readSession(env.DB, 'expired-token')).resolves.toBeNull();
  });

  it('prunes expired sessions when a session is created', async () => {
    await insertSession('stale-token', 1);
    await createSession(env.DB, { login: 'octocat', avatarUrl: null });
    const remaining = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?',
    )
      .bind(await sha256Hex('stale-token'))
      .first<{ count: number }>();
    expect(remaining?.count).toBe(0);
  });

  it('builds and parses the session cookie', async () => {
    const id = await createSession(env.DB, {
      login: 'octocat',
      avatarUrl: 'https://example.com/avatar.png',
    });
    const cookie = sessionCookie(id);
    expect(cookie).toContain(`jf_session=${id}`);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    const header = cookie.split(';')[0];
    const request = new Request('https://jury-forge.test/', {
      headers: { Cookie: `other=1; ${header}` },
    });
    expect(sessionIdFromCookie(request)).toBe(id);
    expect(sessionIdFromCookie(new Request('https://jury-forge.test/'))).toBeNull();
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});

async function insertSession(id: string, expiresAt: number): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, login, avatar_url, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await sha256Hex(id), 'octocat', null, 0, expiresAt)
    .run();
}
