import type { SessionUser } from '@jury-forge/shared';
import { Hono } from 'hono';
import { hasInstallationAccess } from '../lib/access';
import { importEncryptionKey, randomToken } from '../lib/crypto';
import { exchangeOAuthCode, fetchUser } from '../lib/github';
import { loadGitHubApp } from '../lib/github-app';
import { deleteMeta, getMeta, isClaimed, setMeta } from '../lib/instance';
import {
  clearSessionCookie,
  cookieValue,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  sessionCookie,
} from '../lib/sessions';
import { requireSession, sameOrigin, type AppEnv } from '../middleware';

const OAUTH_STATE_TTL_SECONDS = 600;

export const authRoutes = new Hono<AppEnv>();

authRoutes.use('*', sameOrigin());

authRoutes.get('/github/start', async (c) => {
  const encryptionKeyValue = c.env.ENCRYPTION_KEY;
  if (!encryptionKeyValue) {
    return c.json({ error: 'encryption_key_unset' }, 500);
  }
  const app = await loadGitHubApp(c.env.DB, await importEncryptionKey(encryptionKeyValue));
  if (!app) {
    return c.json({ error: 'setup_required' }, 409);
  }

  const claimed = await isClaimed(c.env.DB);
  const state = randomToken(24);
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    'INSERT INTO oauth_states (state, kind, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(state, claimed ? 'login' : 'claim', now, now + OAUTH_STATE_TTL_SECONDS)
    .run();

  const origin = new URL(c.req.url).origin;
  const params = new URLSearchParams({
    client_id: app.clientId,
    state,
    redirect_uri: `${origin}/api/auth/github/callback`,
  });
  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

authRoutes.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const origin = new URL(c.req.url).origin;
  if (!code || !state) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const encryptionKeyValue = c.env.ENCRYPTION_KEY;
  if (!encryptionKeyValue) {
    return c.json({ error: 'encryption_key_unset' }, 500);
  }

  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);
  const stateRow = await db
    .prepare('SELECT state FROM oauth_states WHERE state = ? AND kind IN (?, ?) AND expires_at > ?')
    .bind(state, 'login', 'claim', now)
    .first<{ state: string }>();
  if (stateRow) {
    await db.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  }
  if (!stateRow) {
    return c.json({ error: 'invalid_state' }, 400);
  }

  const app = await loadGitHubApp(db, await importEncryptionKey(encryptionKeyValue));
  if (!app) {
    return c.json({ error: 'setup_required' }, 409);
  }

  const token = await exchangeOAuthCode(app.clientId, app.clientSecret, code);
  const user = await fetchUser(token);
  const installationIdValue = await getMeta(db, 'installation_id');
  const installationId = installationIdValue ? Number(installationIdValue) : null;
  const claimed = await isClaimed(db);

  if (!claimed) {
    if (installationId === null) {
      return c.redirect(`${origin}/setup?error=installation_required`);
    }
    if (!(await hasInstallationAccess(token, installationId))) {
      return c.redirect(`${origin}/setup?error=access_denied`);
    }
    await setMeta(db, 'owner_login', user.login);
    await setMeta(db, 'owner_id', String(user.id));
    await setMeta(db, 'owner_type', (await getMeta(db, 'installation_account_type')) ?? 'user');
    await setMeta(db, 'claimed_at', String(now));
    await deleteMeta(db, 'setup_session_hash');
    await deleteMeta(db, 'setup_session_expires');
  } else if (installationId === null || !(await hasInstallationAccess(token, installationId))) {
    return c.redirect(`${origin}/?error=access_denied`);
  }

  const sessionId = await createSession(db, { login: user.login, avatarUrl: user.avatarUrl });
  c.header('Set-Cookie', sessionCookie(sessionId));
  return c.redirect(`${origin}/`);
});

authRoutes.get('/session', requireSession(), (c) => {
  const user: SessionUser = c.get('user');
  return c.json(user);
});

authRoutes.post('/logout', requireSession(), async (c) => {
  const sessionId = cookieValue(c.req.raw, SESSION_COOKIE);
  if (sessionId) {
    await deleteSession(c.env.DB, sessionId);
  }
  c.header('Set-Cookie', clearSessionCookie());
  return c.body(null, 204);
});
