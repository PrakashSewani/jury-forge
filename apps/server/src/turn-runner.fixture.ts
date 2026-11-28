// A worker process for the WP 1-11 fault-injection test (turn-runner.int.test.ts): the queue, the
// turn runner, and the store's TurnStore wired the way the `worker` app will wire them. Step `b`
// hangs on its first attempt, after its effect, so the test can kill the process mid-step.
// Configured by TURN_FIXTURE (JSON). Test-only.

import { runTurn, type TurnStep } from '@jury-forge/pipeline';
import { createStore, createTurnStore, GraphileJobQueue } from '@jury-forge/store';
import pg from 'pg';

const config = JSON.parse(process.env['TURN_FIXTURE'] ?? '{}') as {
  databaseUrl: string;
  name: string;
};
const send = (message: Record<string, unknown>) => process.send?.(message);
const db = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
const store = createStore({ databaseUrl: config.databaseUrl, maxConnections: 4 });
const turns = createTurnStore(store);

function step(name: string): TurnStep {
  return {
    name,
    input: (context) => ({ step: name, after: [...context.outputs.keys()] }),
    async run(_input, context) {
      await db.query(
        'insert into step_runs (turn_id, step, attempt, worker) values ($1, $2, $3, $4)',
        [context.turn.turnId, name, context.attempt, config.name],
      );
      // The step's effect, idempotent by (turn, step) as job-pipeline.md rule 5 requires.
      await db.query('insert into effects (turn_id, step) values ($1, $2) on conflict do nothing', [
        context.turn.turnId,
        name,
      ]);
      if (name === 'b' && context.attempt === 1) {
        send({ type: 'in-step', step: name });
        await new Promise(() => {}); // the test kills this process here
      }
      return { output: { done: name }, tokens: 7 };
    },
  };
}

const queue = new GraphileJobQueue(store, {
  databaseUrl: config.databaseUrl,
  pollIntervalMs: 200,
  heartbeatMs: 300,
  host: config.name,
});

queue.onJob<{ org_id: string; turn_id: string }>('session.turn', async (payload, context) => {
  const outcome = await runTurn({
    store: turns,
    orgId: payload.org_id,
    turnId: payload.turn_id,
    steps: [step('a'), step('b'), step('c')],
    attempt: context.attempt,
    maxAttempts: 3,
    signal: context.signal,
  });
  send({ type: 'outcome', outcome });
});

process.on('message', async (message) => {
  if (message === 'stop') {
    await queue.stop();
    await store.destroy();
    await db.end();
    process.exit(0);
  }
});

await queue.start();
send({ type: 'ready', poolId: queue.poolId });
