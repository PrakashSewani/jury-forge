// WP 1-13: the datastore readiness behind `/readyz` against a real PostgreSQL 17
// (observability.md §9, deployment.md §8).
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrations.ts';
import { checkReadiness, shippedMigrations } from './readiness.ts';
import { createStore } from './store.ts';

const runtime = await requireContainerRuntime();

let container: Awaited<ReturnType<typeof startPostgres>>;
let databaseCount = 0;

async function freshDatabase(): Promise<string> {
  const name = `wp113_${++databaseCount}`;
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

describe.runIf(runtime)('store readiness (WP 1-13)', () => {
  beforeAll(async () => {
    container = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('lists the shipped SQL migrations by their recorded names', async () => {
    const names = await shippedMigrations();
    expect(names[0]).toBe('0001_foundation');
    expect(names).toEqual([...names].sort());
    expect(names.every((name) => /^\d{4}_[a-z0-9_]+$/.test(name))).toBe(true);
  });

  it('reports migrations and queue pending on an empty database', async () => {
    const store = createStore({ databaseUrl: await freshDatabase(), maxConnections: 2 });
    try {
      expect(await checkReadiness(store)).toEqual({
        database: 'ok',
        migrations: 'pending',
        queue: 'pending',
      });
    } finally {
      await store.destroy();
    }
  });

  it('reports pending while the last migration is not applied', async () => {
    const url = await freshDatabase();
    const shipped = await shippedMigrations();
    await migrate({ databaseUrl: url, count: shipped.length - 1 });
    const store = createStore({ databaseUrl: url, maxConnections: 2 });
    try {
      expect(await checkReadiness(store)).toEqual({
        database: 'ok',
        migrations: 'pending',
        queue: 'ok',
      });
    } finally {
      await store.destroy();
    }
  });

  it('is ok once every migration is applied', async () => {
    const url = await freshDatabase();
    await migrate({ databaseUrl: url });
    const store = createStore({ databaseUrl: url, maxConnections: 2 });
    try {
      expect(await checkReadiness(store)).toEqual({
        database: 'ok',
        migrations: 'ok',
        queue: 'ok',
      });
    } finally {
      await store.destroy();
    }
  });

  it('reports an unreachable database as error and passes the reason to onError only', async () => {
    const url = new URL(container.getConnectionUri());
    url.port = '1'; // nothing listens there
    const store = createStore({ databaseUrl: url.toString(), maxConnections: 1 });
    const errors: string[] = [];
    try {
      expect(
        await checkReadiness(store, {
          timeoutMs: 5000,
          onError: (component) => errors.push(component),
        }),
      ).toEqual({ database: 'error', migrations: 'error', queue: 'error' });
      expect(errors).toEqual(['database']);
    } finally {
      await store.destroy();
    }
  });
});
