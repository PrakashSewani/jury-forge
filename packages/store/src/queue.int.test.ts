// WP 1-10: the graphile-worker JobQueue adapter against a real PostgreSQL 17, with worker processes
// (queue.fixture.ts). Covers the WP exit (serialization, debounce, transactional enqueue, cron once
// per tick across two workers) and the spike S-A and ADR-0037 carry-over (graceful stop, a killed
// worker, a fenced worker, queue cleanup).
import { type ChildProcess, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrations.ts';
import { GraphileJobQueue, releaseDeadWorkers } from './queue.ts';
import { createStore, type Store } from './store.ts';

const runtime = await requireContainerRuntime();
const FIXTURE = fileURLToPath(new URL('./queue.fixture.ts', import.meta.url));

let container: Awaited<ReturnType<typeof startPostgres>>;
let databaseCount = 0;
const children: ChildProcess[] = [];
const stores: Store[] = [];

interface Db {
  url: string;
  orgId: string;
  store: Store;
  queue: GraphileJobQueue;
  query: <R extends pg.QueryResultRow>(text: string, values?: unknown[]) => Promise<R[]>;
}

async function freshDb(): Promise<Db> {
  const name = `wp110_${++databaseCount}`;
  const admin = new pg.Client({ connectionString: container.getConnectionUri() });
  await admin.connect();
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();
  await migrate({ databaseUrl });
  const query = async <R extends pg.QueryResultRow>(text: string, values: unknown[] = []) => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      return (await client.query<R>(text, values)).rows;
    } finally {
      await client.end();
    }
  };
  await query(`create table queue_test_log (
    id bigserial primary key, task text not null, session text, seq int, attempt int,
    worker text, pool_id text, scheduled_at timestamptz,
    started_at timestamptz not null default clock_timestamp(), ended_at timestamptz, outcome text)`);
  const store = createStore({ databaseUrl, maxConnections: 4 });
  stores.push(store);
  const org = await store.instance.selectFrom('orgs').select('id').executeTakeFirstOrThrow();
  return {
    url: databaseUrl,
    orgId: org.id,
    store,
    queue: new GraphileJobQueue(store, { databaseUrl }),
    query,
  };
}

interface Worker {
  child: ChildProcess;
  poolId: string;
  exited: Promise<number | null>;
  messages: Record<string, unknown>[];
}

async function startWorker(
  url: string,
  name: string,
  options: { concurrency?: number; heartbeatMs?: number; crons?: [string, string][] } = {},
): Promise<Worker> {
  const child = fork(FIXTURE, [], {
    env: { ...process.env, QUEUE_FIXTURE: JSON.stringify({ databaseUrl: url, name, ...options }) },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  children.push(child);
  const messages: Record<string, unknown>[] = [];
  child.on('message', (message) => messages.push(message as Record<string, unknown>));
  const exited = new Promise<number | null>((resolve) =>
    child.once('exit', (code) => resolve(code)),
  );
  const poolId = await new Promise<string>((resolve, reject) => {
    child.on('message', (message) => {
      const m = message as { type?: string; poolId?: string };
      if (m.type === 'ready' && typeof m.poolId === 'string') resolve(m.poolId);
    });
    child.once('exit', (code) => reject(new Error(`worker ${name} exited early: ${code}`)));
  });
  return { child, poolId, exited, messages };
}

async function stopWorker(worker: Worker): Promise<void> {
  if (worker.child.exitCode !== null || worker.child.signalCode !== null) return;
  worker.child.send('stop');
  await worker.exited;
}

async function waitFor<T>(
  fn: () => Promise<T | null | false | undefined>,
  timeoutMs: number,
  everyMs = 100,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
}

interface LogRow {
  session: string;
  seq: number;
  attempt: number;
  worker: string;
  outcome: string | null;
  started_at: Date;
  ended_at: Date | null;
}

const turns = (db: Db, session?: string) =>
  db.query<LogRow>(
    `select session, seq, attempt, worker, outcome, started_at, ended_at from queue_test_log
     where task = 'test.turn' ${session ? 'and session = $1' : ''} order by started_at, id`,
    session ? [session] : [],
  );

const turn = (db: Db, session: string, seq: number, extra: Record<string, unknown> = {}) => ({
  task: 'test.turn',
  payload: { org_id: db.orgId, session, seq, ...extra },
  serialKey: `session:${session}`,
  maxAttempts: 3,
});

describe.runIf(runtime)('graphile-worker JobQueue adapter (WP 1-10)', () => {
  beforeAll(async () => {
    container = await startPostgres();
  });
  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    for (const store of stores.splice(0)) await store.destroy();
  });
  afterAll(async () => {
    await container?.stop();
  });

  it('runs one job at a time per serial key, in order, across two worker processes', async () => {
    const db = await freshDb();
    await Promise.all([
      startWorker(db.url, 'w1', { concurrency: 4 }),
      startWorker(db.url, 'w2', { concurrency: 4 }),
    ]);
    const sessions = 8;
    const perSession = 5;
    for (let seq = 0; seq < perSession; seq++) {
      await Promise.all(
        Array.from({ length: sessions }, (_, s) =>
          db.queue.enqueue(turn(db, `s${s}`, seq, { sleepMs: 20 })),
        ),
      );
    }
    const rows = await waitFor(async () => {
      const all = await turns(db);
      return all.filter((r) => r.outcome === 'ok').length === sessions * perSession && all;
    }, 60_000);

    const bySession = Map.groupBy(rows, (r) => r.session);
    for (const [, list] of bySession) {
      expect(list.map((r) => r.seq)).toEqual([0, 1, 2, 3, 4]);
      for (let i = 1; i < list.length; i++) {
        const previous = list[i - 1] as LogRow;
        expect((list[i] as LogRow).started_at.getTime()).toBeGreaterThanOrEqual(
          (previous.ended_at as Date).getTime(),
        );
      }
    }
    expect(new Set(rows.map((r) => r.worker)).size).toBe(2);
    const events = rows.flatMap((r) => [
      [r.started_at.getTime(), 1],
      [(r.ended_at as Date).getTime(), -1],
    ]);
    events.sort(
      (a, b) => (a[0] as number) - (b[0] as number) || (a[1] as number) - (b[1] as number),
    );
    let running = 0;
    let peak = 0;
    for (const [, delta] of events) {
      running += delta as number;
      peak = Math.max(peak, running);
    }
    expect(peak).toBeGreaterThan(1);
  });

  it('collapses concurrent coalescing triggers into one run per serial key', async () => {
    const db = await freshDb();
    await startWorker(db.url, 'w1', { concurrency: 4 });
    const runAt = new Date(Date.now() + 1500);
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        db.queue.enqueue({ ...turn(db, `d${i % 5}`, i), coalesce: true, runAt }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const rows = await turns(db);
    expect(rows.length).toBe(5);
    expect(new Set(rows.map((r) => r.session)).size).toBe(5);
    const jobsLeft = await db.query<{ n: number }>(
      'select count(*)::int as n from graphile_worker._private_jobs',
    );
    expect(jobsLeft[0]?.n).toBe(0);
  });

  it('adds a job in the caller’s transaction: never on rollback, after commit otherwise', async () => {
    const db = await freshDb();
    const jobs = async () =>
      (
        await db.query<{ n: number }>(
          'select count(*)::int as n from graphile_worker._private_jobs',
        )
      )[0]?.n;

    await expect(
      db.store.transaction(async (tx) => {
        await tx
          .forOrg(db.orgId)
          .insertInto('webhook_deliveries', { delivery_id: 'd-1', event: 'pull_request' })
          .execute();
        await db.queue.enqueueTx(tx, turn(db, 't1', 1));
        expect(await jobs()).toBe(0); // invisible outside the open transaction
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(await jobs()).toBe(0);
    expect(await db.query('select 1 from webhook_deliveries')).toEqual([]);

    await db.store.transaction(async (tx) => {
      await tx
        .forOrg(db.orgId)
        .insertInto('webhook_deliveries', { delivery_id: 'd-2', event: 'pull_request' })
        .execute();
      await db.queue.enqueueTx(tx, turn(db, 't2', 1));
    });
    expect(await jobs()).toBe(1);
    await startWorker(db.url, 'w1');
    await waitFor(async () => (await turns(db, 't2')).some((r) => r.outcome === 'ok'), 15_000);
  });

  it('cancels a coalesced job that has not started', async () => {
    const db = await freshDb();
    await db.queue.enqueue({
      ...turn(db, 'c1', 1),
      coalesce: true,
      runAt: new Date(Date.now() + 60_000),
    });
    expect(await db.queue.cancel('session:c1')).toBe(true);
    expect(await db.queue.cancel('session:c1')).toBe(false);
    expect(await db.query('select 1 from graphile_worker._private_jobs')).toEqual([]);
  });

  it('on a graceful stop, releases an aborted job so another worker retries it (spike S-A R3)', async () => {
    const db = await freshDb();
    const w1 = await startWorker(db.url, 'w1');
    await db.queue.enqueue(turn(db, 'g1', 1, { hangOnAttempt: 1 }));
    await db.queue.enqueue(turn(db, 'g1', 2));
    await waitFor(async () => (await turns(db, 'g1')).length > 0, 15_000);
    expect(
      await db.query('select 1 from worker_heartbeats where pool_id = $1', [w1.poolId]),
    ).toHaveLength(1);
    await startWorker(db.url, 'w2');

    await stopWorker(w1);
    const rows = await waitFor(async () => {
      const list = await turns(db, 'g1');
      return list.filter((r) => r.outcome === 'ok').length === 2 && list;
    }, 30_000);
    expect(rows.map((r) => [r.seq, r.attempt, r.worker, r.outcome])).toContainEqual([
      1,
      1,
      'w1',
      'aborted',
    ]);
    expect(rows.filter((r) => r.outcome === 'ok').map((r) => r.worker)).toEqual(['w2', 'w2']);
    expect(
      await db.query('select 1 from worker_heartbeats where pool_id = $1', [w1.poolId]),
    ).toEqual([]);
  });

  it('releases a killed worker’s locks once its heartbeat is silent, and the session resumes in order (ADR-0037)', async () => {
    const db = await freshDb();
    const w1 = await startWorker(db.url, 'w1', { concurrency: 1, heartbeatMs: 300 });
    await db.queue.enqueue(turn(db, 'k1', 1, { hangOnAttempt: 1 }));
    await db.queue.enqueue(turn(db, 'k1', 2));
    await waitFor(async () => (await turns(db, 'k1')).length > 0, 15_000);
    w1.child.kill('SIGKILL');
    await w1.exited;
    await startWorker(db.url, 'w2');

    // Nothing is released while the dead worker's heartbeat is still recent.
    expect(await releaseDeadWorkers(db.store, { silentForMs: 60_000, fenceGraceMs: 0 })).toEqual(
      [],
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const released = await releaseDeadWorkers(db.store, { silentForMs: 1000, fenceGraceMs: 300 });
    expect(released).toEqual([{ poolId: w1.poolId, jobsReleased: 1 }]);

    const rows = await waitFor(async () => {
      const list = await turns(db, 'k1');
      return list.filter((r) => r.outcome === 'ok').length === 2 && list;
    }, 30_000);
    expect(rows.filter((r) => r.outcome === 'ok').map((r) => [r.seq, r.attempt, r.worker])).toEqual(
      [
        [1, 2, 'w2'],
        [2, 1, 'w2'],
      ],
    );
    const heartbeat = await db.query<{ released_at: Date | null }>(
      'select released_at from worker_heartbeats where pool_id = $1',
      [w1.poolId],
    );
    expect(heartbeat[0]?.released_at).toBeInstanceOf(Date);
  });

  it('fences a live worker whose heartbeat went silent before its job runs elsewhere (ADR-0037)', async () => {
    const db = await freshDb();
    const w1 = await startWorker(db.url, 'w1', { concurrency: 1, heartbeatMs: 1000 });
    await db.queue.enqueue(turn(db, 'f1', 1, { hangOnAttempt: 1 }));
    await waitFor(async () => (await turns(db, 'f1')).length > 0, 15_000);
    await startWorker(db.url, 'w2');

    // Simulate a heartbeat that stopped arriving while the process keeps running.
    await db.query(
      `update worker_heartbeats set last_seen_at = now() - interval '1 hour' where pool_id = $1`,
      [w1.poolId],
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const released = await releaseDeadWorkers(db.store, { silentForMs: 200, fenceGraceMs: 3000 });

    expect(await w1.exited).toBe(3);
    expect(w1.messages).toContainEqual({ type: 'fenced', poolId: w1.poolId });
    // The fenced worker released its own lock during the grace wait, so nothing was force-unlocked.
    expect(released).toEqual([{ poolId: w1.poolId, jobsReleased: 0 }]);

    const rows = await waitFor(async () => {
      const list = await turns(db, 'f1');
      return list.some((r) => r.outcome === 'ok') && list;
    }, 30_000);
    expect(rows.map((r) => [r.attempt, r.worker, r.outcome])).toEqual([
      [1, 'w1', 'aborted'],
      [2, 'w2', 'ok'],
    ]);
    const [first, second] = rows as [LogRow, LogRow];
    expect(second.started_at.getTime()).toBeGreaterThanOrEqual((first.ended_at as Date).getTime());
  });

  it('cleans up queue rows that nothing uses (spike S-A R6)', async () => {
    const db = await freshDb();
    await db.query(
      `insert into graphile_worker._private_job_queues (queue_name)
       select 'session:stale-' || g from generate_series(1, 500) g`,
    );
    await db.queue.cleanup();
    expect(await db.query('select 1 from graphile_worker._private_job_queues')).toEqual([]);
  });

  it('fires each cron tick exactly once with two worker processes (audit Q-E)', async () => {
    const db = await freshDb();
    const crons: [string, string][] = [['cron:test_tick', '* * * * *']];
    await Promise.all([startWorker(db.url, 'w1', { crons }), startWorker(db.url, 'w2', { crons })]);
    const ticks = await waitFor(
      async () => {
        const rows = await db.query<{ scheduled_at: Date; runs: number }>(
          `select scheduled_at, count(*)::int as runs from queue_test_log
             where task = 'cron:test_tick' group by scheduled_at order by scheduled_at`,
        );
        return rows.length >= 2 && rows;
      },
      150_000,
      1000,
    );
    expect(ticks.map((t) => t.runs)).toEqual(ticks.map(() => 1));
    expect(ticks[1]?.scheduled_at.getTime()).toBe(
      (ticks[0]?.scheduled_at.getTime() as number) + 60_000,
    );
  }, 200_000);
});
