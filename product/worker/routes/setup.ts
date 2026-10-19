import {
  PRODUCT_NAME,
  InstallationInfoSchema,
  SetupCodeResponseSchema,
  SetupStateSchema,
  type AppManifest,
  type InstallationInfo,
  type SetupCodeResponse,
  type SetupState,
} from '@jury-forge/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  constantTimeEqual,
  keyRingValues,
  loadKeyRing,
  randomToken,
  sha256Hex,
} from '../lib/crypto';
import { convertManifest, listAppInstallations } from '../lib/github';
import { loadGitHubApp, storeGitHubApp } from '../lib/github-app';
import { deleteMeta, getMeta, isClaimed, setMeta } from '../lib/instance';
import { errorResponse, respond } from '../lib/respond';
import { cookieValue } from '../lib/sessions';
import { sameOrigin, type AppEnv } from '../middleware';

const SETUP_TTL_SECONDS = 60 * 60;
const SETUP_COOKIE = 'jf_setup';

const codeRequest = z.object({
  code: z.string().min(1),
  org: z.string().min(1).optional(),
});

export const setupRoutes = new Hono<AppEnv>();

setupRoutes.use('*', sameOrigin());

setupRoutes.get('/state', async (c) => {
  const [app, claimedAt, installationId] = await Promise.all([
    c.env.DB.prepare('SELECT slug FROM github_app LIMIT 1').first<{ slug: string }>(),
    getMeta(c.env.DB, 'claimed_at'),
    getMeta(c.env.DB, 'installation_id'),
  ]);
  const body: SetupState = {
    claimed: claimedAt !== null,
    appCreated: app !== null,
    installed: installationId !== null,
    appSlug: app?.slug ?? null,
  };
  return respond(SetupStateSchema, body);
});

setupRoutes.post('/code', async (c) => {
  const db = c.env.DB;
  const setupCode = c.env.SETUP_CODE;
  if (!setupCode) {
    return errorResponse('setup_code_unset', 500);
  }
  if (await isClaimed(db)) {
    return errorResponse('already_claimed', 409);
  }

  const parsed = codeRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  if (!(await constantTimeEqual(parsed.data.code, setupCode))) {
    return errorResponse('invalid_code', 401);
  }

  const now = Math.floor(Date.now() / 1000);
  await db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now).run();

  const state = randomToken(24);
  await db
    .prepare('INSERT INTO oauth_states (state, kind, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(state, 'manifest', now, now + SETUP_TTL_SECONDS)
    .run();

  const setupToken = randomToken(32);
  await setMeta(db, 'setup_session_hash', await sha256Hex(setupToken));
  await setMeta(db, 'setup_session_expires', String(now + SETUP_TTL_SECONDS));

  const origin = new URL(c.req.url).origin;
  const body: SetupCodeResponse = {
    actionsUrl: manifestActionsUrl(parsed.data.org, state),
    state,
    manifest: manifestFor(origin),
  };
  const response = respond(SetupCodeResponseSchema, body);
  response.headers.set(
    'Set-Cookie',
    `${SETUP_COOKIE}=${setupToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SETUP_TTL_SECONDS}`,
  );
  return response;
});

setupRoutes.get('/manifest/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) {
    return errorResponse('invalid_request', 400);
  }
  const db = c.env.DB;
  const values = keyRingValues(c.env);
  if (await isClaimed(db)) {
    return errorResponse('already_claimed', 409);
  }
  if (!values) {
    return errorResponse('encryption_key_unset', 500);
  }

  const now = Math.floor(Date.now() / 1000);
  const stateRow = await db
    .prepare('SELECT state FROM oauth_states WHERE state = ? AND kind = ? AND expires_at > ?')
    .bind(state, 'manifest', now)
    .first<{ state: string }>();
  if (stateRow) {
    await db.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  }
  if (!stateRow) {
    return errorResponse('invalid_state', 400);
  }

  const conversion = await convertManifest(code);
  await storeGitHubApp(db, await loadKeyRing(values), conversion);
  await deleteMeta(db, 'installation_id');
  await deleteMeta(db, 'installation_account_login');
  await deleteMeta(db, 'installation_account_type');

  return c.redirect(`${new URL(c.req.url).origin}/setup`);
});

setupRoutes.post('/verify-installation', async (c) => {
  const db = c.env.DB;
  const values = keyRingValues(c.env);
  if (await isClaimed(db)) {
    return errorResponse('already_claimed', 409);
  }
  if (!values) {
    return errorResponse('encryption_key_unset', 500);
  }

  const now = Math.floor(Date.now() / 1000);
  const setupToken = cookieValue(c.req.raw, SETUP_COOKIE);
  const storedHash = await getMeta(db, 'setup_session_hash');
  const expiresAt = Number((await getMeta(db, 'setup_session_expires')) ?? '0');
  const sessionValid =
    setupToken !== null &&
    storedHash !== null &&
    expiresAt > now &&
    (await constantTimeEqual(await sha256Hex(setupToken), storedHash));
  if (!sessionValid) {
    return errorResponse('setup_session_required', 401);
  }

  const app = await loadGitHubApp(db, await loadKeyRing(values));
  if (!app) {
    return errorResponse('app_missing', 409);
  }

  const installations = await listAppInstallations(app.appId, app.privateKey);
  const installation = installations[0];
  if (!installation) {
    const body: InstallationInfo = { installed: false, account: null };
    return respond(InstallationInfoSchema, body);
  }

  const accountType = installation.account.type === 'Organization' ? 'org' : 'user';
  await setMeta(db, 'installation_id', String(installation.id));
  await setMeta(db, 'installation_account_login', installation.account.login);
  await setMeta(db, 'installation_account_type', accountType);

  const body: InstallationInfo = {
    installed: true,
    account: { login: installation.account.login, type: accountType },
  };
  return respond(InstallationInfoSchema, body);
});

function manifestActionsUrl(org: string | undefined, state: string): string {
  const base = org
    ? `https://github.com/organizations/${org}/settings/apps/new`
    : 'https://github.com/settings/apps/new';
  return `${base}?state=${state}`;
}

function manifestFor(origin: string): AppManifest {
  return {
    name: PRODUCT_NAME,
    url: origin,
    hook_attributes: { url: `${origin}/api/webhooks/github`, active: true },
    redirect_url: `${origin}/api/setup/manifest/callback`,
    // GitHub sends the operator back to the wizard once the app is installed, so the install step
    // does not end on GitHub's own app page (the setting is only editable without the UI paying for
    // it: an App created before this line landed keeps GitHub's default until it is recreated).
    setup_url: `${origin}/setup`,
    callback_urls: [`${origin}/api/auth/github/callback`],
    public: false,
    default_permissions: { contents: 'read', pull_requests: 'write' },
    default_events: ['pull_request'],
  };
}
