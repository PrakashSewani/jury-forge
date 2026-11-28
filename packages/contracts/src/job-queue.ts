// The `JobQueue` port: the five functions the rest of the code sees (technical-approach §3.3,
// job-pipeline.md). `store` implements it with graphile-worker; `pipeline` and the apps depend only
// on this interface, so the backend can change (spike S-A proved a pg-boss adapter fits it).

/** A JSON value that can travel in a job payload. */
export type JobJson =
  | null
  | boolean
  | number
  | string
  | readonly JobJson[]
  | { readonly [key: string]: JobJson };

/**
 * The payload of a tenant job. It always names its org (ADR-0035 decision 6) and carries ids, not
 * content: the handler reads the current state from the database (spike S-A R1), because a
 * coalesced or retried job may run with an older payload.
 */
export interface TenantJobPayload {
  readonly org_id: string;
  readonly [key: string]: JobJson;
}

export interface JobSpec<P extends TenantJobPayload = TenantJobPayload> {
  task: string;
  payload: P;
  /** Jobs with the same serial key run one at a time (one turn per PR session). */
  serialKey?: string;
  /**
   * Replace this serial key's job that has not started yet, instead of adding another: the
   * debounce. Needs `serialKey`. The debounce is trailing, so triggers faster than the delay keep
   * postponing the job (spike S-A R8).
   */
  coalesce?: boolean;
  /** Do not run before this time. */
  runAt?: Date;
  /** How many attempts in total, at least 1. Always explicit (spike S-A R7). */
  maxAttempts: number;
}

export interface JobRef {
  id: string;
}

export interface JobContext {
  /** 1 on the first run. */
  attempt: number;
  jobId: string;
  /** Aborted on shutdown or when the worker is fenced; steps stop at the next boundary. */
  signal: AbortSignal;
}

/** The payload a scheduled (cron) task receives. */
export interface CronTick {
  /** The scheduled time of this tick, ISO 8601. */
  scheduledAt: string;
  /** True when the tick is a backfill of a missed time. */
  backfilled: boolean;
}

export type JobHandler<P> = (payload: P, context: JobContext) => Promise<void>;

/**
 * The queue port. `Tx` is the store's transaction type: `enqueueTx` adds the job in the caller's
 * transaction, so the job exists only if the state change that caused it commits (the outbox).
 */
export interface JobQueue<Tx> {
  enqueue(job: JobSpec): Promise<JobRef>;
  enqueueTx(tx: Tx, job: JobSpec): Promise<JobRef>;
  /** Drops the serial key's coalesced job that has not started. True if there was one. */
  cancel(serialKey: string): Promise<boolean>;
  /** Registers a cron task (five-field expression, minute resolution); call before the worker starts. */
  schedule(task: string, cron: string): void;
  /** Registers the handler of a task; call before the worker starts. */
  onJob<P>(task: string, handler: JobHandler<P>): void;
}
