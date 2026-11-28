// What a failed turn step leads to (job-pipeline.md, "Retries and failure classes"). Pure: the turn
// runner reports the failure, and this decides whether the queue retries the job or the turn ends.
//
// - `transient` (a network error, a 5xx or 429, a database serialization failure) and any error that
//   is not a StepFailure: retry while attempts remain; on the last attempt the turn fails and the job
//   stays permanently failed in the queue, inspectable and retryable by an admin (ADR-0006).
// - `terminal` (a provider 4xx, `finish=length`, a forge 4xx, a verifier that cannot run): the turn
//   fails now with its reason; retrying would repeat the same failure.
// - `budget`: a hard budget stopped the turn (ADR-0024 §7); it fails closed as `budget_stopped`.
// - An abort (shutdown or fencing) is never finished here: the worker that was stopped must not
//   write the turn's outcome, and the job runs again elsewhere.

export type FailureKind = 'transient' | 'terminal' | 'budget';

/** A step failure with a class and a stable reason code, for example `provider_auth`. */
export class StepFailure extends Error {
  override name = 'StepFailure';
  readonly kind: FailureKind;
  readonly reason: string;

  constructor(kind: FailureKind, reason: string, message?: string, options?: ErrorOptions) {
    super(message ?? reason, options);
    if (reason === '') throw new RangeError('A step failure needs a reason code.');
    this.kind = kind;
    this.reason = reason;
  }
}

export type FailureDecision =
  /** Rethrow, so the queue retries the job (or, after an abort, another worker picks it up). */
  | { action: 'retry'; reason: string }
  /** End the turn with this status; `rethrow` leaves the queue job permanently failed. */
  | {
      action: 'finish';
      status: 'failed' | 'budget_stopped';
      stopReason: string;
      rethrow: boolean;
    };

export interface FailureInput {
  error: unknown;
  /** The attempt that failed, 1 on the first run. */
  attempt: number;
  maxAttempts: number;
  /** True when the job's abort signal fired (shutdown or fencing). */
  aborted: boolean;
}

export function decideFailure(input: FailureInput): FailureDecision {
  const { error, attempt, maxAttempts, aborted } = input;
  if (
    !Number.isInteger(attempt) ||
    !Number.isInteger(maxAttempts) ||
    attempt < 1 ||
    maxAttempts < 1
  ) {
    throw new RangeError('attempt and maxAttempts are integers of at least 1.');
  }
  if (aborted) return { action: 'retry', reason: 'aborted' };
  if (error instanceof StepFailure && error.kind === 'budget') {
    return { action: 'finish', status: 'budget_stopped', stopReason: error.reason, rethrow: false };
  }
  if (error instanceof StepFailure && error.kind === 'terminal') {
    return { action: 'finish', status: 'failed', stopReason: error.reason, rethrow: false };
  }
  const reason = error instanceof StepFailure ? error.reason : 'internal_error';
  if (attempt < maxAttempts) return { action: 'retry', reason };
  return { action: 'finish', status: 'failed', stopReason: reason, rethrow: true };
}
