// The graphile-worker adapter behind the `JobQueue` port (technical-approach §3.3, job-pipeline.md,
// spike S-A, ADR-0037).
//
// - A serial key is graphile-worker's `queue_name`: one job at a time per key (per PR session).
// - `coalesce` is `job_key = <serialKey>:pending` in `replace` mode: the trailing debounce. When the
//   key's job is already running, graphile-worker clears that job's key, removes its remaining
//   retries, and adds a new job (spike S-A E3), so handlers read their inputs from the database.
// - Complete and fail writes go through graphile-worker's batcher, so a graceful stop waits for
//   them (spike S-A E6b, R3).
// - Worker liveness and lock release follow ADR-0037, with a grace wait between marking a silent
//   pool and unlocking it, so a slow but live worker fences itself before its jobs run elsewhere.

import { EventEmitter } from 'node:events';
import { hostname } from 'node:os';
import type {
  CronTick,
  JobContext,
  JobHandler,
  JobQueue,
  JobRef,
  JobSpec,
} from '@jury-forge/contracts';
import {
  Logger,
  makeWorkerUtils,
  type Runner,
  run,
  type Task,
  type TaskList,
  type WorkerEvents,
} from 'graphile-worker';
import { sql } from 'kysely';
import { executorOf, type Store } from './store.ts';

/** The job_key suffix that marks a serial key's not-yet-started, coalescing job. */
const PENDING_SUFFIX = ':pending';

/** graphile-worker's crontab grammar for task identifiers (dist/cronConstants.js CRONTAB_COMMAND). */
const CRON_TASK_NAME = /^[_a-zA-Z][_a-zA-Z0-9:/_-]*$/;
const CRON_EXPRESSION = /^[0-9*/,-]+(\s+[0-9*/,-]+){4}$/;

export type QueueLogLevel = 'info' | 'warn' | 'error';

export interface GraphileJobQueueOptions {
  databaseUrl: string;
  /** Jobs this worker runs at once. Defaults to 2 (session-capacity: 2–4 per worker). */
  concurrency?: number;
  /** How often an idle worker polls, besides LISTEN/NOTIFY. Defaults to 1000 ms (pickup p95 < 2 s). */
  pollIntervalMs?: number;
  /** Heartbeat interval (ADR-0037). Defaults to 30 000 ms. */
  heartbeatMs?: number;
  /** Recorded with the heartbeat for `doctor`. Defaults to the host name. */
  host?: string;
  /** Called once when this worker is fenced and has stopped; the worker process should exit. */
  onFenced?: (poolId: string) => void;
  log?: (level: QueueLogLevel, message: string) => void;
}

export class QueueUsageError extends Error {
  override name = 'QueueUsageError';
}

/** Thrown into a job that finished after its worker was fenced, so the job is not completed. */
export class FencedError extends Error {
  override name = 'FencedError';
}

export class GraphileJobQueue implements JobQueue<Store> {
  readonly #store: Store;
  readonly #databaseUrl: string;
  readonly #concurrency: number;
  readonly #pollIntervalMs: number;
  readonly #heartbeatMs: number;
  readonly #host: string;
  readonly #onFenced: (poolId: string) => void;
  readonly #log: (level: QueueLogLevel, message: string) => void;
  readonly #handlers = new Map<string, JobHandler<unknown>>();
  readonly #crontab: string[] = [];
  readonly #cronTasks = new Set<string>();
  readonly #fence = new AbortController();
  #runner: Runner | null = null;
  #poolId: string | null = null;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #fenced = false;
  #started = false;

  constructor(store: Store, options: GraphileJobQueueOptions) {
    this.#store = store;
    this.#databaseUrl = options.databaseUrl;
    this.#concurrency = options.concurrency ?? 2;
    this.#pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.#heartbeatMs = options.heartbeatMs ?? 30_000;
    this.#host = options.host ?? hostname();
    this.#onFenced = options.onFenced ?? (() => {});
    this.#log = options.log ?? (() => {});
  }

  /** graphile-worker's pool id for this worker once started: its `locked_by` value. */
  get poolId(): string | null {
    return this.#poolId;
  }

  get fenced(): boolean {
    return this.#fenced;
  }

  enqueue(job: JobSpec): Promise<JobRef> {
    return addJob(this.#store, job);
  }

  enqueueTx(tx: Store, job: JobSpec): Promise<JobRef> {
    return addJob(tx, job);
  }

  async cancel(serialKey: string): Promise<boolean> {
    requireKey(serialKey);
    const result = await sql<{ id: string | null }>`
      select (graphile_worker.remove_job(${serialKey + PENDING_SUFFIX}::text)).id::text as id
    `.execute(executorOf(this.#store));
    return result.rows[0]?.id != null;
  }

  schedule(task: string, cron: string): void {
    this.#assertNotStarted();
    if (!CRON_TASK_NAME.test(task)) {
      throw new QueueUsageError(`A cron task name must match ${CRON_TASK_NAME}: ${task}`);
    }
    if (!CRON_EXPRESSION.test(cron.trim())) {
      throw new QueueUsageError(`A cron expression has five fields: ${cron}`);
    }
    if (this.#cronTasks.has(task)) {
      throw new QueueUsageError(`Cron task already scheduled: ${task}`);
    }
    this.#cronTasks.add(task);
    this.#crontab.push(`${cron.trim()} ${task}`);
  }

  onJob<P>(task: string, handler: JobHandler<P>): void {
    this.#assertNotStarted();
    if (task === '') throw new QueueUsageError('A task needs a name.');
    if (this.#handlers.has(task)) throw new QueueUsageError(`Handler already registered: ${task}`);
    this.#handlers.set(task, handler as JobHandler<unknown>);
  }

  /** Starts taking jobs and running cron, and starts the heartbeat. */
  async start(): Promise<void> {
    this.#assertNotStarted();
    for (const task of this.#cronTasks) {
      if (!this.#handlers.has(task)) throw new QueueUsageError(`Cron task has no handler: ${task}`);
    }
    this.#started = true;
    const taskList: TaskList = {};
    for (const [task, handler] of this.#handlers) {
      taskList[task] = this.#wrap(handler, this.#cronTasks.has(task));
    }
    const events = new EventEmitter() as WorkerEvents;
    events.on('pool:create', ({ workerPool }) => {
      this.#poolId = workerPool.id;
    });
    const log = this.#log;
    this.#runner = await run({
      connectionString: this.#databaseUrl,
      concurrency: this.#concurrency,
      pollInterval: this.#pollIntervalMs,
      taskList,
      crontab: this.#crontab.join('\n'),
      noHandleSignals: true,
      events,
      logger: new Logger(() => (level, message) => {
        if (level === 'error') log('error', message);
        else if (level === 'warning') log('warn', message);
      }),
      // Route complete/fail writes through the batcher so graceful shutdown awaits them; with the
      // default (-1) an aborted job's failure is lost and its lock stays for 4 h (spike S-A E6b).
      preset: { worker: { completeJobBatchDelay: 0, failJobBatchDelay: 0 } },
    });
    if (this.#poolId === null) {
      await this.#runner.stop();
      throw new QueueUsageError('graphile-worker started without reporting its pool id.');
    }
    await this.#store.instance
      .insertInto('worker_heartbeats')
      .values({ pool_id: this.#poolId, host: this.#host })
      .onConflict((oc) => oc.column('pool_id').doNothing())
      .execute();
    this.#heartbeat = setInterval(() => void this.#beat(), this.#heartbeatMs);
    this.#heartbeat.unref();
  }

  /** Stops taking jobs, waits for running ones (aborting them after 5 s), and clears the heartbeat. */
  async stop(): Promise<void> {
    this.#stopHeartbeat();
    const runner = this.#runner;
    this.#runner = null;
    if (runner !== null) await runner.stop();
    if (this.#poolId !== null) {
      await this.#store.instance
        .deleteFrom('worker_heartbeats')
        .where('pool_id', '=', this.#poolId)
        .where('released_at', 'is', null)
        .execute();
    }
  }

  /**
   * Removes queue rows that nothing uses any more (spike S-A R6): graphile-worker keeps a row per
   * named queue, one per session, and every fetch scans them. Run daily from the retention job.
   */
  async cleanup(): Promise<void> {
    const utils = await makeWorkerUtils({ connectionString: this.#databaseUrl });
    try {
      await utils.cleanup({ tasks: ['GC_JOB_QUEUES', 'GC_TASK_IDENTIFIERS'] });
    } finally {
      await utils.release();
    }
  }

  #assertNotStarted(): void {
    if (this.#started) throw new QueueUsageError('Register tasks and crons before start().');
  }

  #wrap(handler: JobHandler<unknown>, isCron: boolean): Task {
    return async (payload, helpers) => {
      const context: JobContext = {
        attempt: helpers.job.attempts,
        jobId: String(helpers.job.id),
        signal: AbortSignal.any([helpers.abortSignal, this.#fence.signal]),
      };
      await handler(isCron ? cronTick(payload) : payload, context);
      // graphile-worker completes a job by deleting it by id, whoever holds it now
      // (dist/sql/completeJobs.js); a fenced worker fails it instead, which is scoped to this pool.
      if (this.#fenced)
        throw new FencedError('This worker was fenced; the job is left for its new holder.');
    };
  }

  async #beat(): Promise<void> {
    const poolId = this.#poolId;
    if (poolId === null || this.#fenced) return;
    try {
      const result = await this.#store.instance
        .updateTable('worker_heartbeats')
        .set({ last_seen_at: sql`now()` })
        .where('pool_id', '=', poolId)
        .where('released_at', 'is', null)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) await this.#fenceSelf(poolId);
    } catch (error) {
      // A database outage is not a fence: the sweep marks this pool, and the next beat sees it.
      this.#log(
        'warn',
        `heartbeat failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async #fenceSelf(poolId: string): Promise<void> {
    if (this.#fenced) return;
    this.#fenced = true;
    this.#stopHeartbeat();
    this.#log('error', `worker pool ${poolId} was fenced: its locks are being released; stopping`);
    this.#fence.abort(new FencedError('fenced'));
    const runner = this.#runner;
    this.#runner = null;
    try {
      if (runner !== null) await runner.stop();
    } catch (error) {
      this.#log(
        'error',
        `stopping a fenced worker failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.#onFenced(poolId);
  }

  #stopHeartbeat(): void {
    if (this.#heartbeat !== null) {
      clearInterval(this.#heartbeat);
      this.#heartbeat = null;
    }
  }
}

function requireKey(serialKey: string): void {
  if (typeof serialKey !== 'string' || serialKey === '') {
    throw new QueueUsageError('A serial key must be a non-empty string.');
  }
}

async function addJob(store: Store, job: JobSpec): Promise<JobRef> {
  if (job.task === '') throw new QueueUsageError('A job needs a task.');
  if (!Number.isInteger(job.maxAttempts) || job.maxAttempts < 1) {
    throw new QueueUsageError('maxAttempts must be an integer of at least 1.');
  }
  if (typeof job.payload?.org_id !== 'string' || job.payload.org_id === '') {
    throw new QueueUsageError('Every job payload carries its org_id (ADR-0035).');
  }
  if (job.serialKey !== undefined) requireKey(job.serialKey);
  if (job.coalesce === true && job.serialKey === undefined) {
    throw new QueueUsageError('coalesce needs a serialKey.');
  }
  const jobKey = job.coalesce === true ? `${job.serialKey}${PENDING_SUFFIX}` : null;
  const result = await sql<{ id: string }>`
    select (graphile_worker.add_job(
      identifier => ${job.task}::text,
      payload => ${JSON.stringify(job.payload)}::json,
      queue_name => ${job.serialKey ?? null}::text,
      run_at => ${job.runAt ?? null}::timestamptz,
      max_attempts => ${job.maxAttempts}::int,
      job_key => ${jobKey}::text,
      job_key_mode => ${jobKey === null ? null : 'replace'}::text
    )).id::text as id
  `.execute(executorOf(store));
  const id = result.rows[0]?.id;
  if (id === undefined) throw new Error('graphile_worker.add_job returned no job.');
  return { id };
}

function cronTick(payload: unknown): CronTick {
  const cron = (payload as { _cron?: { ts?: unknown; backfilled?: unknown } } | null)?._cron;
  return {
    scheduledAt: typeof cron?.ts === 'string' ? cron.ts : new Date().toISOString(),
    backfilled: cron?.backfilled === true,
  };
}

export interface ReleasedPool {
  poolId: string;
  /** Jobs that were still locked by the pool when it was unlocked. */
  jobsReleased: number;
}

export interface ReleaseDeadWorkersOptions {
  /** A pool is dead when its heartbeat and its oldest lock are older than this. Defaults to 120 000. */
  silentForMs?: number;
  /**
   * The wait between marking a pool and unlocking it, so a slow but live worker sees the mark and
   * stops before its jobs run elsewhere. At least one heartbeat interval; defaults to 35 000.
   */
  fenceGraceMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * ADR-0037: finds worker pools that hold queue locks but have sent no heartbeat for
 * `silentForMs`, marks them released (which fences a live one at its next heartbeat), waits
 * `fenceGraceMs`, then unlocks whatever they still hold. Called by the stuck-turn sweep
 * (WP 1-28a), which also writes the audit event. Reads graphile-worker's private tables, covered by
 * this adapter's integration tests.
 */
export async function releaseDeadWorkers(
  store: Store,
  options: ReleaseDeadWorkersOptions = {},
): Promise<ReleasedPool[]> {
  const silentSeconds = (options.silentForMs ?? 120_000) / 1000;
  const graceMs = options.fenceGraceMs ?? 35_000;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const db = executorOf(store);

  const candidates = await db.transaction().execute(async (trx) => {
    const { rows } = await sql<{ pool_id: string }>`
      select h.pool_id
      from (
        select locked_by as pool_id, min(locked_at) as oldest
        from (
          select locked_by, locked_at from graphile_worker._private_jobs where locked_by is not null
          union all
          select locked_by, locked_at from graphile_worker._private_job_queues where locked_by is not null
        ) as locks
        group by locked_by
      ) as h
      left join worker_heartbeats as w on w.pool_id = h.pool_id
      where h.oldest < now() - make_interval(secs => ${silentSeconds}::double precision)
        and (w.pool_id is null
             or w.released_at is not null
             or w.last_seen_at < now() - make_interval(secs => ${silentSeconds}::double precision))
      order by h.pool_id
    `.execute(trx);
    const ids = rows.map((row) => row.pool_id);
    if (ids.length > 0) {
      await sql`
        insert into worker_heartbeats (pool_id, released_at)
        select pool_id, now() from unnest(${ids}::text[]) as pool_id
        on conflict (pool_id) do update
          set released_at = coalesce(worker_heartbeats.released_at, excluded.released_at)
      `.execute(trx);
    }
    return ids;
  });
  if (candidates.length === 0) return [];

  await sleep(graceMs);

  return db.transaction().execute(async (trx) => {
    const { rows } = await sql<{ pool_id: string; jobs: number }>`
      select locked_by as pool_id, count(*)::int as jobs
      from graphile_worker._private_jobs
      where locked_by = any(${candidates}::text[])
      group by locked_by
    `.execute(trx);
    await sql`select graphile_worker.force_unlock_workers(${candidates}::text[])`.execute(trx);
    const counts = new Map(rows.map((row) => [row.pool_id, row.jobs]));
    return candidates.map((poolId) => ({ poolId, jobsReleased: counts.get(poolId) ?? 0 }));
  });
}
