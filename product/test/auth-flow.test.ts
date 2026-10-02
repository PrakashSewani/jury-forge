import { env } from 'cloudflare:workers';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { resetInstanceState } from './db';
import { testPrivateKeyPem } from './fixtures';
import { network } from './network';

const ORIGIN = 'https://jury-forge.test';
const JSON_HEADERS = { 'Content-Type': 'application/json', Origin: ORIGIN };

beforeEach(resetInstanceState);

function mockGitHubOAuth(): void {
  network.use(
    http.post('https://github.com/login/oauth/access_token', () =>
      HttpResponse.json({ access_token: 'ghu_test_token', token_type: 'bearer' }),
    ),
    http.get('https://api.github.com/user', () =>
      HttpResponse.json({
        login: 'octocat',
        id: 1,
        avatar_url: 'https://example.com/avatar.png',
      }),
    ),
    http.get('https://api.github.com/user/installations', () =>
      HttpResponse.json({ total_count: 1, installations: [{ id: 4242 }] }),
    ),
  );
}

async function createApp(): Promise<string> {
  network.use(
    http.post('https://api.github.com/app-manifests/:code/conversions', () =>
      HttpResponse.json({
        id: 987,
        slug: 'jury-forge-test',
        pem: testPrivateKeyPem,
        webhook_secret: 'whsec_test',
        client_id: 'client-id-test',
        client_secret: 'client-secret-test',
      }),
    ),
  );

  const codeResponse = await app.request(
    `${ORIGIN}/api/setup/code`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ code: 'test-setup-code' }) },
    env,
  );
  const { state } = (await codeResponse.json()) as { state: string };
  const cookie = (codeResponse.headers.get('Set-Cookie') ?? '').split(';')[0];

  const callbackResponse = await app.request(
    `${ORIGIN}/api/setup/manifest/callback?code=manifest-code&state=${state}`,
    {},
    env,
  );
  expect(callbackResponse.status).toBe(302);

  return cookie;
}

async function verifyInstallation(cookie: string): Promise<void> {
  network.use(
    http.get('https://api.github.com/app/installations', () =>
      HttpResponse.json([{ id: 4242, account: { login: 'octocat', type: 'User' } }]),
    ),
  );
  const verifyResponse = await app.request(
    `${ORIGIN}/api/setup/verify-installation`,
    { method: 'POST', headers: { Origin: ORIGIN, Cookie: cookie } },
    env,
  );
  expect(verifyResponse.status).toBe(200);
}

async function completeSetup(): Promise<void> {
  const cookie = await createApp();
  await verifyInstallation(cookie);
}

async function startOAuth(): Promise<string> {
  const response = await app.request(`${ORIGIN}/api/auth/github/start`, {}, env);
  expect(response.status).toBe(302);
  const params = new URL(response.headers.get('Location') ?? '').searchParams;
  expect(params.get('client_id')).toBe('client-id-test');
  expect(params.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/github/callback`);
  const state = params.get('state');
  expect(state).toBeTruthy();
  return state ?? '';
}

async function oauthCallback(state: string): Promise<Response> {
  return app.request(`${ORIGIN}/api/auth/github/callback?code=oauth-code&state=${state}`, {}, env);
}

async function claimInstance(): Promise<string> {
  await completeSetup();
  mockGitHubOAuth();
  const state = await startOAuth();
  const response = await oauthCallback(state);
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe(`${ORIGIN}/`);
  const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0];
  expect(cookie).toMatch(/^jf_session=/);
  return cookie;
}

describe('auth flow', () => {
  it('claims the instance on the first access-gated sign-in', async () => {
    await claimInstance();

    const meta = await env.DB.prepare(
      "SELECT key, value FROM instance_meta WHERE key IN ('claimed_at', 'owner_login', 'owner_id', 'owner_type', 'setup_session_hash')",
    ).all<{ key: string; value: string }>();
    const values = Object.fromEntries(meta.results.map((row) => [row.key, row.value]));
    expect(values.owner_login).toBe('octocat');
    expect(values.owner_id).toBe('1');
    expect(values.owner_type).toBe('user');
    expect(values.claimed_at).toBeTruthy();
    expect(values.setup_session_hash).toBeUndefined();
  });

  it('signs in on an already-claimed instance', async () => {
    await claimInstance();
    const state = await startOAuth();
    const response = await oauthCallback(state);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/`);
    expect(response.headers.get('Set-Cookie')).toMatch(/^jf_session=/);
  });

  it('denies a user who cannot see the installation', async () => {
    await claimInstance();
    network.use(
      http.get('https://api.github.com/user/installations', () =>
        HttpResponse.json({ total_count: 1, installations: [{ id: 9999 }] }),
      ),
    );
    const state = await startOAuth();
    const response = await oauthCallback(state);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/?error=access_denied`);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('redirects to the wizard when the installation is unverified', async () => {
    await createApp();
    mockGitHubOAuth();
    const state = await startOAuth();
    const response = await oauthCallback(state);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/setup?error=installation_required`);
  });

  it('rejects an invalid OAuth state', async () => {
    const response = await oauthCallback('bogus');
    expect(response.status).toBe(400);
  });

  it('serves the session and logs out', async () => {
    const sessionCookie = await claimInstance();

    const me = await app.request(
      `${ORIGIN}/api/auth/session`,
      { headers: { Cookie: sessionCookie } },
      env,
    );
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toEqual({
      login: 'octocat',
      avatarUrl: 'https://example.com/avatar.png',
    });

    const anonymous = await app.request(`${ORIGIN}/api/auth/session`, {}, env);
    expect(anonymous.status).toBe(401);

    const logout = await app.request(
      `${ORIGIN}/api/auth/logout`,
      { method: 'POST', headers: { Origin: ORIGIN, Cookie: sessionCookie } },
      env,
    );
    expect(logout.status).toBe(204);

    const after = await app.request(
      `${ORIGIN}/api/auth/session`,
      { headers: { Cookie: sessionCookie } },
      env,
    );
    expect(after.status).toBe(401);
  });
});
