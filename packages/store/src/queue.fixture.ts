// A worker process for the queue integration tests (queue.int.test.ts): one GraphileJobQueue with
// test handlers that record each run in `queue_test_log`. Configured by the QUEUE_FIXTURE
// environment variable (JSON); talks to the test over IPC. Test-only; never imported by product code.

import pg from 'pg';
import { GraphileJobQueue } from './queue.ts';
import { createStore } from './store.ts';

interface FixtureConfig {
  databaseUrl: string;
  name: string;
  concurrency?: number;
  heartbeatMs?: number;
  crons?: [task: string, expression: string][];
}

interface TurnPayload {
  org_id: string;
  session: string;
  seq: number;
  sleepMs?: number;
  hangOnAttempt?: number;
  failOnAttempt?: number;
}

const config = JSON.parse(process.env['QUEUE_FIXTURE'] ?? '{}') as FixtureConfig;
const send = (message: Record<string, unknown>) => process.send?.(message);
const log = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
const store = createStore({ databaseUrl: config.databaseUrl, maxConnections: 4 });

const queue = new GraphileJobQueue(store, {
  databaseUrl: config.databaseUrl,
  concurrency: config.concurrency ?? 2,
  pollIntervalMs: 200,
  heartbeatMs: config.heartbeatMs ?? 30_000,
  host: config.name,
  onFenced: (poolId) => {
    send({ type: 'fenced', poolId });
    void shutdown(3);
  },
});

queue.onJob<TurnPayload>('test.turn', async (payload, context) => {
  const {
    rows: [row],
  } = await log.query<{ id: string }>(
    `insert into queue_test_log (task, session, seq, attempt, worker, pool_id)
     values ('test.turn', $1, $2, $3, $4, $5) returning id`,
    [payload.session, payload.seq, context.attempt, config.name, queue.poolId],
  );
  const finish = (outcome: string) =>
    log.query(
      'update queue_test_log set ended_at = clock_timestamp(), outcome = $2 where id = $1',
      [row?.id, outcome],
    );
  if (payload.hangOnAttempt !== undefined && context.attempt <= payload.hangOnAttempt) {
    await new Promise<void>((_resolve, reject) => {
      context.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }).catch(async (error: unknown) => {
      await finish('aborted');
      throw error;
    });
  }
  await new Promise((resolve) => setTimeout(resolve, payload.sleepMs ?? 10));
  if (payload.failOnAttempt !== undefined && context.attempt <= payload.failOnAttempt) {
    await finish('error');
    throw new Error('injected failure');
  }
  await finish('ok');
});

for (const [task, expression] of config.crons ?? []) {
  queue.schedule(task, expression);
  queue.onJob<{ scheduledAt: string; backfilled: boolean }>(task, async (tick) => {
    await log.query(
      `insert into queue_test_log (task, worker, pool_id, scheduled_at, ended_at, outcome)
       values ($1, $2, $3, $4, clock_timestamp(), 'ok')`,
      [task, config.name, queue.poolId, tick.scheduledAt],
    );
  });
}

let stopping = false;
async function shutdown(code: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    if (!queue.fenced) await queue.stop();
  } finally {
    await store.destroy();
    await log.end();
    process.exit(code);
  }
}

process.on('message', (message) => {
  if (message === 'stop') void shutdown(0);
});

await queue.start();
send({ type: 'ready', poolId: queue.poolId });
