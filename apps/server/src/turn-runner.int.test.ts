// WP 1-11 exit: kill a worker mid-step, and the turn resumes on another worker without duplicate
// effects. The queue, the runner, and the store run together in real processes on PostgreSQL 17.
import { type ChildProcess, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createStore,
  GraphileJobQueue,
  migrate,
  releaseDeadWorkers,
  type Store,
} from '@jury-forge/store';
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const runtime = await requireContainerRuntime();
const FIXTURE = fileURLToPath(new URL('./turn-runner.fixture.ts', import.meta.url));

let container: Awaited<ReturnType<typeof startPostgres>>;
const children: ChildProcess[] = [];

function startWorker(databaseUrl: string, name: string) {
  const child = fork(FIXTURE, [], {
    env: { ...process.env, TURN_FIXTURE: JSON.stringify({ databaseUrl, name }) },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  children.push(child);
  const messages: { type?: string; [key: string]: unknown }[] = [];
  child.on('message', (m) => messages.push(m as { type?: string }));
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const ready = new Promise<void>((resolve, reject) => {
    child.on('message', (m) => {
      if ((m as { type?: string }).type === 'ready') resolve();
    });
    child.once('exit', (code) => reject(new Error(`worker ${name} exited early: ${code}`)));
  });
  return { child, messages, exited, ready };
}

async function waitFor<T>(
  fn: () => Promise<T | null | false | undefined>,
  timeoutMs: number,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe.runIf(runtime)('turn runner fault injection (WP 1-11)', () => {
  let store: Store;
  let databaseUrl: string;
  const query = async <R extends pg.QueryResultRow>(text: string, values: unknown[] = []) => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      return (await client.query<R>(text, values)).rows;
    } finally {
      await client.end();
    }
  };

  beforeAll(async () => {
    container = await startPostgres();
    databaseUrl = container.getConnectionUri();
    await migrate({ databaseUrl });
    store = createStore({ databaseUrl, maxConnections: 4 });
    await query(
      `create table step_runs (id bigserial primary key, turn_id uuid, step text, attempt int, worker text)`,
    );
    await query(`create table effects (turn_id uuid, step text, primary key (turn_id, step))`);
  });
  afterAll(async () => {
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await store?.destroy();
    await container?.stop();
  });

  it('resumes a killed turn on another worker: finished steps are not redone, no effect is duplicated', async () => {
    const org = await store.instance.selectFrom('orgs').select('id').executeTakeFirstOrThrow();
    const scope = store.forOrg(org.id);
    const installation = await scope
      .insertInto('installations', {
        forge: 'github',
        base_url: 'https://api.github.com',
        external_id: 1,
        account_login: 'acme',
        account_type: 'organization',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const repository = await scope
      .insertInto('repositories', {
        installation_id: installation.id,
        external_id: 10,
        full_name: 'acme/app',
        private: true,
        default_branch: 'main',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const session = await scope
      .insertInto('pr_sessions', {
        installation_id: installation.id,
        repository_id: repository.id,
        pr_number: 1,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // The trigger: the turn row and its job in one transaction (the outbox).
    const queue = new GraphileJobQueue(store, { databaseUrl });
    const turnId = await store.transaction(async (tx) => {
      const turn = await tx
        .forOrg(org.id)
        .insertInto('session_turns', { session_id: session.id, generation: 0, trigger: 'label' })
        .returning('id')
        .executeTakeFirstOrThrow();
      await queue.enqueueTx(tx, {
        task: 'session.turn',
        payload: { org_id: org.id, turn_id: turn.id },
        serialKey: `session:${session.id}`,
        maxAttempts: 3,
      });
      return turn.id;
    });

    const w1 = startWorker(databaseUrl, 'w1');
    await w1.ready;
    await waitFor(async () => w1.messages.some((m) => m.type === 'in-step'), 30_000);
    w1.child.kill('SIGKILL');
    await w1.exited;

    const w2 = startWorker(databaseUrl, 'w2');
    await w2.ready;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await releaseDeadWorkers(store, { silentForMs: 1000, fenceGraceMs: 300 })).toHaveLength(
      1,
    );

    await waitFor(async () => w2.messages.some((m) => m.type === 'outcome'), 30_000);
    expect(w2.messages.find((m) => m.type === 'outcome')).toEqual({
      type: 'outcome',
      outcome: { status: 'completed', stopReason: null },
    });

    const runs = await query<{ step: string; attempt: number; worker: string }>(
      'select step, attempt, worker from step_runs where turn_id = $1 order by id',
      [turnId],
    );
    expect(runs).toEqual([
      { step: 'a', attempt: 1, worker: 'w1' },
      { step: 'b', attempt: 1, worker: 'w1' },
      { step: 'b', attempt: 2, worker: 'w2' },
      { step: 'c', attempt: 2, worker: 'w2' },
    ]);
    expect(
      await query('select step from effects where turn_id = $1 order by step', [turnId]),
    ).toEqual([{ step: 'a' }, { step: 'b' }, { step: 'c' }]);
    const steps = await query<{ step: string }>(
      'select step from turn_steps where turn_id = $1 order by created_at',
      [turnId],
    );
    expect(steps.map((s) => s.step)).toEqual(['a', 'b', 'c']);
    const turn = await scope
      .selectFrom('session_turns')
      .select(['status', 'tokens', 'started_at', 'finished_at'])
      .where('id', '=', turnId)
      .executeTakeFirstOrThrow();
    expect(turn).toMatchObject({ status: 'completed', tokens: '21' });

    w2.child.send('stop');
    await w2.exited;
  });
});
