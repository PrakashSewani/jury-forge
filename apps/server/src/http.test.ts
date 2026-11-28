import type { StoreReadiness } from '@jury-forge/store';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildAppServer, buildSetupServer } from './http.ts';

const logger = pino({ level: 'silent' });
const allOk: StoreReadiness = { database: 'ok', migrations: 'ok', queue: 'ok' };

describe('app server', () => {
  it('answers /healthz without checking anything', async () => {
    let checked = 0;
    const app = buildAppServer({
      logger,
      readiness: async () => {
        checked += 1;
        return allOk;
      },
    });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(checked).toBe(0);
    await app.close();
  });

  it('answers /readyz with 200 when every component is ok', async () => {
    const app = buildAppServer({ logger, readiness: async () => allOk });
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready', components: allOk });
    expect(response.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it.each<StoreReadiness>([
    { database: 'error', migrations: 'error', queue: 'error' },
    { database: 'ok', migrations: 'pending', queue: 'ok' },
    { database: 'ok', migrations: 'ok', queue: 'pending' },
    { database: 'ok', migrations: 'ok', queue: 'error' },
  ])('answers /readyz with 503 and the breakdown for %j', async (components) => {
    const app = buildAppServer({ logger, readiness: async () => components });
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', components });
    await app.close();
  });

  it('serves nothing else yet', async () => {
    const app = buildAppServer({ logger, readiness: async () => allOk });
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/readyz' })).statusCode).toBe(404);
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
