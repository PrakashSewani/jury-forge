import { env } from 'cloudflare:workers';
import { http, HttpResponse } from 'msw';
import { expect } from 'vitest';
import app from '../worker';
import { testPrivateKeyPem } from './fixtures';
import { network } from './network';

export const ORIGIN = 'https://jury-forge.test';
export const JSON_HEADERS = { 'Content-Type': 'application/json', Origin: ORIGIN };

/** Registers the instance's GitHub App through the setup flow (mocked manifest conversion). */
export async function seedGitHubApp(): Promise<void> {
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
  expect(codeResponse.status).toBe(200);
  const { state } = (await codeResponse.json()) as { state: string };
  const callback = await app.request(
    `${ORIGIN}/api/setup/manifest/callback?code=manifest-code&state=${state}`,
    {},
    env,
  );
  expect(callback.status).toBe(302);
}

export async function signBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  let hex = '';
  for (const byte of mac) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `sha256=${hex}`;
}

export interface PullRequestEventOverrides {
  action?: string;
  draft?: boolean;
  deliveryId?: string;
}

export function pullRequestEvent(overrides: PullRequestEventOverrides = {}): string {
  return JSON.stringify({
    action: overrides.action ?? 'opened',
    installation: { id: 4242 },
    repository: { id: 101, full_name: 'octocat/hello' },
    pull_request: {
      number: 1,
      draft: overrides.draft ?? false,
      head: { sha: 'abc123def456' },
    },
  });
}

export async function postWebhook(
  body: string,
  options: { secret?: string; deliveryId?: string; event?: string } = {},
): Promise<Response> {
  return app.request(
    `${ORIGIN}/api/webhooks/github`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': options.event ?? 'pull_request',
        'x-github-delivery': options.deliveryId ?? 'delivery-1',
        'x-hub-signature-256': await signBody(options.secret ?? 'whsec_test', body),
      },
      body,
    },
    env,
  );
}
