import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { resetInstanceState } from './db';
import { ORIGIN, pullRequestEvent, postWebhook, seedGitHubApp, signBody } from './webhook-helpers';

beforeEach(resetInstanceState);

async function runCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM runs').first<{ count: number }>();
  return row?.count ?? 0;
}

async function rawWebhook(body: string, headers: Record<string, string>): Promise<Response> {
  return app.request(`${ORIGIN}/api/webhooks/github`, { method: 'POST', headers, body }, env);
}

describe('github webhook intake', () => {
  it('503s before the instance is set up', async () => {
    const response = await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-503' });
    expect(response.status).toBe(503);
  });

  it('rejects a bad signature', async () => {
    await seedGitHubApp();
    const response = await postWebhook(pullRequestEvent(), {
      secret: 'wrong-secret',
      deliveryId: 'delivery-bad',
    });
    expect(response.status).toBe(401);
    expect(await runCount()).toBe(0);
  });

  it('rejects a missing signature', async () => {
    await seedGitHubApp();
    const response = await rawWebhook(pullRequestEvent(), {
      'Content-Type': 'application/json',
      'x-github-event': 'pull_request',
      'x-github-delivery': 'delivery-nosig',
    });
    expect(response.status).toBe(401);
    expect(await runCount()).toBe(0);
  });

  it('drops events other than pull_request', async () => {
    await seedGitHubApp();
    const response = await postWebhook(pullRequestEvent(), {
      deliveryId: 'delivery-ping',
      event: 'ping',
    });
    expect(response.status).toBe(202);
    expect(await runCount()).toBe(0);
  });

  it('drops draft and non-runnable pull_request actions', async () => {
    await seedGitHubApp();
    const draft = await postWebhook(pullRequestEvent({ draft: true }), {
      deliveryId: 'delivery-draft',
    });
    expect(draft.status).toBe(202);
    const closed = await postWebhook(pullRequestEvent({ action: 'closed' }), {
      deliveryId: 'delivery-closed',
    });
    expect(closed.status).toBe(202);
    expect(await runCount()).toBe(0);
  });

  it('kicks a run for a runnable pull_request delivery', async () => {
    await seedGitHubApp();
    const response = await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-1' });
    expect(response.status).toBe(202);

    const row = await env.DB.prepare('SELECT status, delivery_id FROM runs').first<{
      status: string;
      delivery_id: string;
    }>();
    expect(row?.status).toBe('running');
    expect(row?.delivery_id).toBe('delivery-1');

    const deliveries = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM webhook_deliveries',
    ).first<{ count: number }>();
    expect(deliveries?.count).toBe(1);
  });

  it('de-duplicates a redelivered event but accepts a new delivery id', async () => {
    await seedGitHubApp();
    const first = await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-dup' });
    const second = await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-dup' });
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await runCount()).toBe(1);

    const redelivery = await postWebhook(pullRequestEvent(), { deliveryId: 'delivery-new' });
    expect(redelivery.status).toBe(202);
    expect(await runCount()).toBe(2);
  });

  it('rejects a malformed payload with a valid signature', async () => {
    await seedGitHubApp();
    const response = await postWebhook('not json', { deliveryId: 'delivery-badjson' });
    expect(response.status).toBe(400);
    const invalidShape = await postWebhook(JSON.stringify({ hello: 'world' }), {
      deliveryId: 'delivery-badshape',
    });
    expect(invalidShape.status).toBe(400);
    expect(await runCount()).toBe(0);
  });

  it('requires a delivery id', async () => {
    await seedGitHubApp();
    const body = pullRequestEvent();
    const response = await rawWebhook(body, {
      'Content-Type': 'application/json',
      'x-github-event': 'pull_request',
      'x-hub-signature-256': await signBody('whsec_test', body),
    });
    expect(response.status).toBe(400);
  });
});
