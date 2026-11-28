// The `worker` role (deployment.md §3): takes queue jobs and runs cron, with the ADR-0037
// heartbeat. No task is registered yet; the turn and cron tasks arrive with M1.5 and WP 1-28a.
// The image runs it as `main.js worker`. On SIGTERM it stops taking jobs and waits for running
// ones, aborting them after graphile-worker's 5 s timeout, so the Compose stop grace period is
// above that (spike S-A R4). A fenced worker exits 1 and the restart policy starts a fresh one.
// It refuses to start when the master key does not open the key probe (WP 1-15a).

import { createStore, GraphileJobQueue, type QueueLogLevel } from '@jury-forge/store';
import type { Logger } from 'pino';
import { EnvError, loadRoleEnv, type RoleEnv } from './env.ts';
import { createLogger } from './logger.ts';
import { MasterKeyCheckError, verifyMasterKeyAtStart } from './master-key-check.ts';
import { waitForSignal } from './shutdown.ts';

export interface RunningWorker {
  poolId: string | null;
  /** Resolves with the pool id when the worker is fenced and has stopped (ADR-0037). */
  fenced: Promise<string>;
  stop: () => Promise<void>;
}

export interface StartWorkerOptions {
  env: RoleEnv;
  logger: Logger;
  /** Defaults to the queue's 30 s (ADR-0037); tests shorten it. */
  heartbeatMs?: number;
}

export async function startWorker(options: StartWorkerOptions): Promise<RunningWorker> {
  const { env, logger } = options;
  const store = createStore({ databaseUrl: env.databaseUrl, maxConnections: 5 });
  try {
    await verifyMasterKeyAtStart(store, env.masterKey);
  } catch (error) {
    await store.destroy();
    throw error;
  }
  let onFenced: (poolId: string) => void = () => {};
  const fenced = new Promise<string>((resolve) => {
    onFenced = resolve;
  });
  const queue = new GraphileJobQueue(store, {
    databaseUrl: env.databaseUrl,
    ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
    onFenced: (poolId) => onFenced(poolId),
    log: (level: QueueLogLevel, message: string) => logger[level](message),
  });
  const stop = async () => {
    try {
      await queue.stop();
    } finally {
      await store.destroy();
    }
  };
  try {
    await queue.start();
  } catch (error) {
    await stop();
    throw error;
  }
  return { poolId: queue.poolId, fenced, stop };
}

/** `main.js worker`: runs until SIGTERM or SIGINT (exit 0) or until fenced (exit 1). */
export async function runWorker(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  if (argv.length > 0) {
    process.stderr.write('usage: worker\n');
    return 2;
  }
  let roleEnv: RoleEnv;
  try {
    roleEnv = loadRoleEnv(env);
  } catch (error) {
    if (error instanceof EnvError) {
      process.stderr.write(`worker: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
  const logger = createLogger(roleEnv.logLevel, 'worker');
  const { signal, dispose } = waitForSignal();
  let running: RunningWorker;
  try {
    running = await startWorker({ env: roleEnv, logger });
  } catch (error) {
    dispose();
    if (error instanceof MasterKeyCheckError) {
      logger.fatal({ code: error.code }, error.message);
    } else {
      logger.fatal({ err: error }, 'worker failed to start');
    }
    return 1;
  }
  logger.info({ poolId: running.poolId }, 'worker started');
  const outcome = await Promise.race([
    signal.then((name) => ({ kind: 'signal' as const, name })),
    running.fenced.then((poolId) => ({ kind: 'fenced' as const, poolId })),
  ]);
  dispose();
  if (outcome.kind === 'fenced') {
    logger.error({ poolId: outcome.poolId }, 'worker fenced; exiting so a fresh one starts');
    await running.stop();
    return 1;
  }
  logger.info({ signal: outcome.name }, 'worker stopping');
  await running.stop();
  logger.info('worker stopped');
  return 0;
}
