// The `app` and `worker` roles against a real PostgreSQL 17.
// WP 1-13: readiness, the setup listener, the worker heartbeat, a clean stop, and fencing (ADR-0037).
// WP 1-15a: the master-key probe at start and in /readyz, `encryption_key_mismatch`, and the key
// never reaching a log line.
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { MasterKey, seal } from '@jury-forge/crypto';
import { migrate } from '@jury-forge/store';
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApp } from './app.ts';
import type { RoleEnv } from './env.ts';
import { createLogger } from './logger.ts';
import { MasterKeyCheckError } from './master-key-check.ts';
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

const newKeyText = () => randomBytes(32).toString('base64');

function roleEnv(databaseUrl: string, keyText = newKeyText()): RoleEnv {
  return {
    databaseUrl,
    masterKey: MasterKey.fromBase64(keyText),
    logLevel: 'info',
    setupBind: { host: '127.0.0.1', port: 0, loopback: true },
    publicUrl: null,
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

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof MasterKeyCheckError ? error.code : String(error);
  }
  return undefined;
}

describe.runIf(runtime)('app and worker roles', () => {
  beforeAll(async () => {
    container = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('app: refuses to start before migrate; after it, /readyz is 200 with every component', async () => {
    const url = await freshDatabase();
    const env = roleEnv(url);
    await expect(startApp({ env, logger, appHost: '127.0.0.1', appPort: 0 })).rejects.toThrow();

    await migrate({ databaseUrl: url });
    const app = await startApp({ env, logger, appHost: '127.0.0.1', appPort: 0 });
    try {
      const base = `http://127.0.0.1:${app.appPort}`;
      expect((await fetch(`${base}/healthz`)).status).toBe(200);
      const ready = await fetch(`${base}/readyz`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({
        status: 'ready',
        components: { database: 'ok', migrations: 'ok', queue: 'ok', master_key: 'ok' },
        origin: { state: 'origin_unset', frozen: false, tls_mode: 'caddy' },
      });

      const setup = await fetch(`http://127.0.0.1:${app.setupPort}/healthz`);
      expect(setup.status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${app.setupPort}/readyz`)).status).toBe(404);
    } finally {
      await app.stop();
    }
  });

  it('app and worker refuse another master key with encryption_key_mismatch', async () => {
    const url = await freshDatabase();
    await migrate({ databaseUrl: url });
    const first = await startApp({ env: roleEnv(url), logger, appHost: '127.0.0.1', appPort: 0 });
    await first.stop();
    const probes = await query<{ key_id: string }>(
      url,
      "select key_id from secrets where kind = 'key_probe'",
    );
    expect(probes).toHaveLength(1);

    const other = roleEnv(url);
    expect(await codeOf(startApp({ env: other, logger, appHost: '127.0.0.1', appPort: 0 }))).toBe(
      'encryption_key_mismatch',
    );
    expect(await codeOf(startWorker({ env: other, logger }))).toBe('encryption_key_mismatch');
    // The refused processes wrote nothing: still the one probe, from the first key.
    expect(await query(url, "select key_id from secrets where kind = 'key_probe'")).toEqual(probes);
  });

  it('app: /readyz turns 503 when the stored probe stops opening under the loaded key', async () => {
    const url = await freshDatabase();
    await migrate({ databaseUrl: url });
    const app = await startApp({ env: roleEnv(url), logger, appHost: '127.0.0.1', appPort: 0 });
    try {
      // As if the database were restored from another instance: a probe sealed under another key.
      const probeRows = await query<{ org_id: string }>(
        url,
        "select org_id from secrets where kind = 'key_probe'",
      );
      const orgId = probeRows[0]?.org_id as string;
      const foreign = seal(
        MasterKey.fromBase64(newKeyText()),
        'jury-forge master key probe v1',
        `${orgId}/key_probe`,
      );
      await query(
        url,
        "update secrets set ciphertext = $1, wrapped_dek = $2, key_id = $3 where kind = 'key_probe'",
        [foreign.ciphertext, foreign.wrappedDek, foreign.keyId],
      );
      const response = await fetch(`http://127.0.0.1:${app.appPort}/readyz`);
      expect(response.status).toBe(503);
      const body = (await response.json()) as { components: { master_key: string } };
      expect(body.components.master_key).toBe('error');
    } finally {
      await app.stop();
    }
  });

  it('never writes the master key to a log line, on success or on refusal', async () => {
    const url = await freshDatabase();
    await migrate({ databaseUrl: url });
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    const keyText = newKeyText();
    const env = roleEnv(url, keyText);
    const log = createLogger('trace', 'app', sink);
    log.info({ env }, 'the whole environment, as a careless log call would write it');
    const app = await startApp({ env, logger: log, appHost: '127.0.0.1', appPort: 0 });
    await fetch(`http://127.0.0.1:${app.appPort}/readyz`);
    await app.stop();
    const worker = await startWorker({ env, logger: createLogger('trace', 'worker', sink) });
    await worker.stop();
    await codeOf(startApp({ env: roleEnv(url), logger: log, appHost: '127.0.0.1', appPort: 0 }));

    const text = chunks.join('');
    expect(text).toContain(env.masterKey.keyId);
    expect(text).not.toContain(keyText);
    expect(text).not.toContain(Buffer.from(keyText, 'base64').toString('hex'));
    expect(text).not.toContain(Buffer.from(keyText, 'base64').toString('base64url').slice(0, 40));
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
