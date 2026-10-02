import type { SessionUser } from '@jury-forge/shared';
import { randomToken, sha256Hex } from './crypto';

const SESSION_COOKIE = 'jf_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function createSession(db: D1Database, user: SessionUser): Promise<string> {
  const id = randomToken(32);
  const tokenHash = await sha256Hex(id);
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    db
      .prepare(
        'INSERT INTO sessions (token_hash, login, avatar_url, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(tokenHash, user.login, user.avatarUrl, now, now + SESSION_TTL_SECONDS),
  ]);
  return id;
}

export async function readSession(db: D1Database, sessionId: string): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(sessionId);
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare('SELECT login, avatar_url FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(tokenHash, now)
    .first<{ login: string; avatar_url: string | null }>();
  if (!row) {
    return null;
  }
  return { login: row.login, avatarUrl: row.avatar_url };
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  const tokenHash = await sha256Hex(sessionId);
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export function sessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function sessionIdFromCookie(request: Request): string | null {
  const header = request.headers.get('Cookie');
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === SESSION_COOKIE) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}
