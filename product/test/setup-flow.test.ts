import type { SetupCodeResponse } from '@jury-forge/shared';
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

function mockManifestConversion(): void {
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
}

function mockAppInstallations(): void {
  network.use(
    http.get('https://api.github.com/app/installations', () =>
      HttpResponse.json([{ id: 4242, account: { login: 'octocat', type: 'User' } }]),
    ),
  );
}

interface StartedSetup {
  body: SetupCodeResponse;
  cookie: string;
}

async function startSetup(): Promise<StartedSetup> {
  const response = await app.request(
    `${ORIGIN}/api/setup/code`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ code: 'test-setup-code' }),
    },
    env,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as SetupCodeResponse;
  const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0];
  expect(cookie).toMatch(/^jf_setup=/);
  return { body, cookie };
}

async function createApp(state: string): Promise<void> {
  mockManifestConversion();
  const response = await app.request(
    `${ORIGIN}/api/setup/manifest/callback?code=manifest-code&state=${state}`,
    {},
    env,
  );
  expect(response.status).toBe(302);
  expect(response.headers.get('Location')).toBe(`${ORIGIN}/setup`);
}

describe('setup flow', () => {
  it('reports fresh wizard state', async () => {
    const response = await app.request(`${ORIGIN}/api/setup/state`, {}, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      claimed: false,
      appCreated: false,
      installed: false,
    });
  });

  it('rejects a wrong setup code', async () => {
    const response = await app.request(
      `${ORIGIN}/api/setup/code`,
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ code: 'wrong' }) },
      env,
    );
    expect(response.status).toBe(401);
  });

  it('rejects cross-origin posts', async () => {
    const response = await app.request(
      `${ORIGIN}/api/setup/code`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        body: JSON.stringify({ code: 'test-setup-code' }),
      },
      env,
    );
    expect(response.status).toBe(403);
  });

  it('accepts the setup code and returns the manifest form', async () => {
    const { body, cookie } = await startSetup();
    expect(body.actionsUrl).toBe(`https://github.com/settings/apps/new?state=${body.state}`);
    expect(body.manifest.name).toBe('Jury Forge');
    expect(body.manifest.public).toBe(false);
    expect(body.manifest.hook_attributes.url).toBe(`${ORIGIN}/api/webhooks/github`);
    expect(body.manifest.redirect_url).toBe(`${ORIGIN}/api/setup/manifest/callback`);
    expect(body.manifest.callback_urls).toEqual([`${ORIGIN}/api/auth/github/callback`]);
    expect(body.manifest.default_events).toEqual(['pull_request']);
    expect(cookie).not.toBe('');

    const stateRow = await env.DB.prepare('SELECT kind FROM oauth_states WHERE state = ?')
      .bind(body.state)
      .first<{ kind: string }>();
    expect(stateRow?.kind).toBe('manifest');
  });

  it('targets an organization when asked', async () => {
    const response = await app.request(
      `${ORIGIN}/api/setup/code`,
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ code: 'test-setup-code', org: 'acme' }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as SetupCodeResponse;
    expect(body.actionsUrl).toBe(
      `https://github.com/organizations/acme/settings/apps/new?state=${body.state}`,
    );
  });

  it('stores the created app encrypted', async () => {
    const { body } = await startSetup();
    await createApp(body.state);

    const row = await env.DB.prepare(
      'SELECT slug, client_id, private_key_enc FROM github_app LIMIT 1',
    ).first<{ slug: string; client_id: string; private_key_enc: string }>();
    expect(row?.slug).toBe('jury-forge-test');
    expect(row?.client_id).toBe('client-id-test');
    expect(row?.private_key_enc).toMatch(/^v1\./);
    expect(row?.private_key_enc).not.toContain('PRIVATE KEY');

    const remaining = await env.DB.prepare('SELECT COUNT(*) AS count FROM oauth_states').first<{
      count: number;
    }>();
    expect(remaining?.count).toBe(0);
  });

  it('rejects an invalid manifest state', async () => {
    mockManifestConversion();
    const response = await app.request(
      `${ORIGIN}/api/setup/manifest/callback?code=manifest-code&state=bogus`,
      {},
      env,
    );
    expect(response.status).toBe(400);
  });

  it('requires the setup session to verify the installation', async () => {
    const { body } = await startSetup();
    await createApp(body.state);
    mockAppInstallations();
    const response = await app.request(
      `${ORIGIN}/api/setup/verify-installation`,
      { method: 'POST', headers: { Origin: ORIGIN } },
      env,
    );
    expect(response.status).toBe(401);
  });

  it('verifies the installation and reports state', async () => {
    const { body, cookie } = await startSetup();
    await createApp(body.state);
    mockAppInstallations();
    const response = await app.request(
      `${ORIGIN}/api/setup/verify-installation`,
      { method: 'POST', headers: { Origin: ORIGIN, Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      installed: true,
      account: { login: 'octocat', type: 'user' },
    });

    const installationId = await env.DB.prepare(
      "SELECT value FROM instance_meta WHERE key = 'installation_id'",
    ).first<{ value: string }>();
    expect(installationId?.value).toBe('4242');

    const state = await app.request(`${ORIGIN}/api/setup/state`, {}, env);
    await expect(state.json()).resolves.toEqual({
      claimed: false,
      appCreated: true,
      installed: true,
    });
  });

  it('blocks setup once claimed', async () => {
    await env.DB.prepare("INSERT INTO instance_meta (key, value) VALUES ('claimed_at', '1')").run();

    const code = await app.request(
      `${ORIGIN}/api/setup/code`,
      {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ code: 'test-setup-code' }),
      },
      env,
    );
    expect(code.status).toBe(409);

    const verify = await app.request(
      `${ORIGIN}/api/setup/verify-installation`,
      { method: 'POST', headers: { Origin: ORIGIN } },
      env,
    );
    expect(verify.status).toBe(409);
  });
});
