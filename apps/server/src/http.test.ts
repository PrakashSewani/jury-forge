import type { StoreReadiness } from '@jury-forge/store';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildAppServer, buildSetupServer, type OriginPort } from './http.ts';
import type { AskDecision, OriginReadiness, OriginState } from './origin-service.ts';

const logger = pino({ level: 'silent' });
const allOk: StoreReadiness = { database: 'ok', migrations: 'ok', queue: 'ok' };
const ORIGIN = { url: 'https://review.example.com', host: 'review.example.com' };

function fakeOrigin(
  overrides: Partial<{
    state: OriginState | Error;
    readiness: OriginReadiness | Error;
    ask: AskDecision | Error;
  }> = {},
): OriginPort & { asked: string[] } {
  const asked: string[] = [];
  const settle = async <T>(value: T | Error): Promise<T> => {
    if (value instanceof Error) throw value;
    return value;
  };
  return {
    asked,
    current: () => settle(overrides.state ?? { origin: ORIGIN, frozen: false, tlsMode: 'caddy' }),
    ask: (domain) => {
      asked.push(domain);
      return settle(overrides.ask ?? 'allow');
    },
    readiness: () =>
      settle(
        overrides.readiness ?? {
          state: 'tls_issued',
          frozen: false,
          tls_mode: 'caddy',
          issuer: 'Test CA',
          valid_to: 'Jan 1 00:00:00 2100 GMT',
        },
      ),
  };
}

function server(origin: OriginPort = fakeOrigin(), readiness = async () => allOk) {
  return buildAppServer({ logger, readiness, origin });
}

describe('app server: health', () => {
  it('answers /healthz on any Host without checking anything', async () => {
    let checked = 0;
    const app = server(fakeOrigin({ state: new Error('db down') }), async () => {
      checked += 1;
      return allOk;
    });
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { host: 'app:3000' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(checked).toBe(0);
    await app.close();
  });

  it('answers /readyz with 200, the components, and the origin state', async () => {
    const app = server();
    const response = await app.inject({
      method: 'GET',
      url: '/readyz',
      headers: { host: '127.0.0.1:3000' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      components: allOk,
      origin: {
        state: 'tls_issued',
        frozen: false,
        tls_mode: 'caddy',
        issuer: 'Test CA',
        valid_to: 'Jan 1 00:00:00 2100 GMT',
      },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('stays 200 before an origin exists: the origin state is reported, not enforced', async () => {
    const app = server(
      fakeOrigin({ readiness: { state: 'origin_unset', frozen: false, tls_mode: 'caddy' } }),
    );
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(response.json().origin).toEqual({
      state: 'origin_unset',
      frozen: false,
      tls_mode: 'caddy',
    });
    await app.close();
  });

  it.each<StoreReadiness>([
    { database: 'error', migrations: 'error', queue: 'error' },
    { database: 'ok', migrations: 'pending', queue: 'ok' },
    { database: 'ok', migrations: 'ok', queue: 'pending' },
  ])('answers /readyz with 503 for %j', async (components) => {
    const app = server(fakeOrigin(), async () => components);
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'not_ready', components });
    await app.close();
  });

  it('answers /readyz with 503 when the origin setting cannot be read, without the error text', async () => {
    const app = server(fakeOrigin({ readiness: new Error('secret detail') }));
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    expect(response.json().origin).toEqual({ state: 'error' });
    expect(response.body).not.toContain('secret detail');
    await app.close();
  });
});

describe('app server: internal routes refuse proxied requests', () => {
  it.each([
    ['x-forwarded-for', '203.0.113.9'],
    ['x-forwarded-host', 'review.example.com'],
    ['x-forwarded-proto', 'https'],
    ['forwarded', 'for=203.0.113.9'],
    ['via', '1.1 caddy'],
  ])('404 for %s on every internal route', async (header, value) => {
    const origin = fakeOrigin();
    const app = server(origin);
    for (const url of [
      '/healthz',
      '/readyz',
      '/api/internal/tls/allow?domain=review.example.com',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { host: 'review.example.com', [header]: value },
      });
      expect(response.statusCode, url).toBe(404);
    }
    expect(origin.asked).toEqual([]);
    await app.close();
  });
});

describe('app server: the TLS ask', () => {
  it.each<[AskDecision, number]>([
    ['allow', 200],
    ['other_name', 403],
    ['not_configured', 403],
    ['front_mode', 403],
    ['rate_limited', 429],
  ])('maps %s to %i', async (decision, status) => {
    const origin = fakeOrigin({ ask: decision });
    const app = server(origin);
    const response = await app.inject({
      method: 'GET',
      url: '/api/internal/tls/allow?domain=Review.Example.com',
      headers: { host: 'app:3000' },
    });
    expect(response.statusCode).toBe(status);
    expect(response.json().allow).toBe(decision === 'allow');
    expect(origin.asked).toEqual(['Review.Example.com']);
    await app.close();
  });

  it('needs a domain and refuses when the setting cannot be read', async () => {
    const app = server(fakeOrigin({ ask: new Error('db down') }));
    expect((await app.inject({ method: 'GET', url: '/api/internal/tls/allow' })).statusCode).toBe(
      400,
    );
    expect(
      (await app.inject({ method: 'GET', url: '/api/internal/tls/allow?domain=' })).statusCode,
    ).toBe(400);
    const failed = await app.inject({
      method: 'GET',
      url: '/api/internal/tls/allow?domain=a.example',
    });
    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toEqual({ allow: false, reason: 'unavailable' });
    await app.close();
  });
});

describe('app server: Host pinning (ADR-0021)', () => {
  it('passes the configured host, with or without :443 and a trailing dot', async () => {
    const app = server();
    for (const host of ['review.example.com', 'Review.Example.com:443', 'review.example.com.']) {
      // Nothing public is served yet, so a pinned request reaches the 404 handler.
      const response = await app.inject({ method: 'GET', url: '/', headers: { host } });
      expect(response.statusCode, host).toBe(404);
    }
    await app.close();
  });

  it.each(['evil.example.com', 'review.example.com:8443', 'app:3000', '127.0.0.1', ''])(
    '421 for Host %j',
    async (host) => {
      const app = server();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/anything',
        headers: { host },
      });
      expect(response.statusCode).toBe(421);
      expect(response.json()).toEqual({ error: 'misdirected_request' });
      await app.close();
    },
  );

  it('ignores X-Forwarded-Host when pinning', async () => {
    const app = server();
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'evil.example.com', 'x-forwarded-host': 'review.example.com' },
    });
    expect(response.statusCode).toBe(421);
    await app.close();
  });

  it('503 origin_unset before an origin exists, and 503 when it cannot be read', async () => {
    const unset = server(fakeOrigin({ state: { origin: null, frozen: false, tlsMode: 'caddy' } }));
    const response = await unset.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'review.example.com' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'origin_unset' });
    await unset.close();

    const broken = server(fakeOrigin({ state: new Error('secret detail') }));
    const failed = await broken.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'review.example.com' },
    });
    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toEqual({ error: 'unavailable' });
    await broken.close();
  });

  it('does not let an encoded path reach an internal route without the internal checks', async () => {
    const origin = fakeOrigin();
    const app = server(origin);
    for (const url of [
      '/api/%69nternal/tls/allow?domain=x',
      '/API/internal/tls/allow?domain=x',
      '//readyz',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { host: 'review.example.com', 'x-forwarded-for': '203.0.113.9' },
      });
      expect(response.statusCode, url).toBe(404);
    }
    expect(origin.asked).toEqual([]);
    await app.close();
  });
});

describe('setup server', () => {
  it('answers /healthz and nothing else yet', async () => {
    const app = buildSetupServer({ logger });
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/setup' })).statusCode).toBe(404);
    await app.close();
  });
});
