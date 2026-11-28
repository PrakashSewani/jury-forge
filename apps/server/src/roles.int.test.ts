// WP 1-13: the `app` and `worker` roles against a real PostgreSQL 17 — readiness before and after
// `migrate`, the setup listener, the worker heartbeat, a clean stop, and fencing (ADR-0037).
import { migrate } from '@jury-forge/store';
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp } from './app.ts';
import type { RoleEnv } from './env.ts';
import { startWorker } from './worker.ts';

const runtime = await requireContainerRuntime();
const logger = pino({ level: 'silent' });

let container: Awaited<ReturnType<typeof startPostgres>>;
let databaseCount = 0;

async function freshDatabase(): Promise<string> {
  const name = `wp113_roles_${++databaseCount}`;
  const admin = new pg.Client({ connectionString: container.getConnectionUri() });
  await admin.connect();
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${name}`;
  return url.toString();
}

function roleEnv(databaseUrl: string): RoleEnv {
  return {
    databaseUrl,
    logLevel: 'info',
    setupBind: { host: '127.0.0.1', port: 0, loopback: true },
  };
}

async function query<T>(url: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(text, values)).rows as T[];
  } finally {
    await client.end();
  }
}

async function until(check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe.runIf(runtime)('app and worker roles (WP 1-13)', () => {
  beforeAll(async () => {
    container = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('app: /readyz is 503 before migrate and 200 after; the setup listener answers /healthz', async () => {
    const url = await freshDatabase();
    const app = await startApp({ env: roleEnv(url), logger, appHost: '127.0.0.1', appPort: 0 });
    try {
      const base = `http://127.0.0.1:${app.appPort}`;
      expect((await fetch(`${base}/healthz`)).status).toBe(200);

      const before = await fetch(`${base}/readyz`);
      expect(before.status).toBe(503);
      expect(await before.json()).toEqual({
        status: 'not_ready',
        components: { database: 'ok', migrations: 'pending', queue: 'pending' },
      });

      await migrate({ databaseUrl: url });
      const after = await fetch(`${base}/readyz`);
      expect(after.status).toBe(200);
      expect(await after.json()).toEqual({
        status: 'ready',
        components: { database: 'ok', migrations: 'ok', queue: 'ok' },
      });

      const setup = await fetch(`http://127.0.0.1:${app.setupPort}/healthz`);
      expect(setup.status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${app.setupPort}/readyz`)).status).toBe(404);
    } finally {
      await app.stop();
    }
  });

  it('worker: beats, and removes its heartbeat on a clean stop', async () => {
    const url = await freshDatabase();
    await migrate({ databaseUrl: url });
    const worker = await startWorker({ env: roleEnv(url), logger });
    expect(worker.poolId).toEqual(expect.any(String));
    const rows = await query<{ pool_id: string }>(
      url,
      'select pool_id from worker_heartbeats where released_at is null',
    );
    expect(rows.map((row) => row.pool_id)).toEqual([worker.poolId]);
    await worker.stop();
    expect(await query(url, 'select 1 from worker_heartbeats')).toEqual([]);
  });

  it('worker: a released pool is fenced at its next heartbeat', async () => {
    const url = await freshDatabase();
    await migrate({ databaseUrl: url });
    const worker = await startWorker({ env: roleEnv(url), logger, heartbeatMs: 100 });
    try {
      await query(url, 'update worker_heartbeats set released_at = now() where pool_id = $1', [
        worker.poolId,
      ]);
      expect(await worker.fenced).toBe(worker.poolId);
      await until(async () => {
        const left = await query(url, 'select 1 from worker_heartbeats where released_at is null');
        return left.length === 0;
      }, 2000);
    } finally {
      await worker.stop();
    }
  });
});
