// The thin turn runner (ADR-0010 as amended, technical-approach §3.4, job-pipeline.md "Steps").
// A turn is an ordered list of steps. Each step's result is stored keyed by (turn_id, step); on a
// retry, finished steps are read back, not run again, so a crash never repeats their effects. Before
// each step the runner checks the session generation, and a moved generation ends the turn as
// `superseded` (ADR-0024). The abort signal (shutdown or fencing) is honoured at step boundaries and
// passed to the step (spike S-A R4). Failures are decided by the domain retry policy.

import { createHash } from 'node:crypto';
import type {
  JobJson,
  StoredStep,
  TerminalTurnStatus,
  TurnRecord,
  TurnStore,
} from '@jury-forge/contracts';
import { canonicalJson, decideFailure } from '@jury-forge/domain';

export interface StepContext {
  readonly turn: TurnRecord;
  /** Outputs of the steps before this one, by step name. */
  readonly outputs: ReadonlyMap<string, JobJson>;
  readonly signal: AbortSignal;
  readonly attempt: number;
}

export interface StepResult {
  output: JobJson;
  tokens?: number;
}

export interface TurnStep {
  readonly name: string;
  /** The step's input, built from the turn and earlier outputs; hashed to detect drift. */
  input(context: StepContext): JobJson;
  /** Does the work. Effects outside the database must be idempotent (job-pipeline.md rule 5). */
  run(input: JobJson, context: StepContext): Promise<StepResult>;
}

export interface RunTurnOptions {
  store: TurnStore;
  orgId: string;
  turnId: string;
  steps: readonly TurnStep[];
  attempt: number;
  maxAttempts: number;
  signal: AbortSignal;
  /** Milliseconds clock for step timings. Defaults to `Date.now`. */
  now?: () => number;
}

export type TurnOutcome =
  | { status: TerminalTurnStatus; stopReason: string | null }
  /** The job pointed at a turn that does not exist, for example after an org was purged. */
  | { status: 'not_found' }
  /** The turn had already finished: a duplicate or late job. */
  | { status: 'already_finished' };

const TERMINAL = new Set(['completed', 'failed', 'superseded', 'budget_stopped']);

export class TurnRunnerError extends Error {
  override name = 'TurnRunnerError';
}

function hashInput(input: JobJson): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('The turn was aborted.');
  }
}

/**
 * Runs a turn's steps. Resolves with the turn's outcome when the turn ends (or was already over);
 * rejects with the step's error when the queue should retry the job (a transient failure with
 * attempts left, an abort) or when the attempts are exhausted (the job then stays permanently
 * failed, and the turn is `failed`).
 */
export async function runTurn(options: RunTurnOptions): Promise<TurnOutcome> {
  const { store, orgId, turnId, steps, attempt, maxAttempts, signal } = options;
  const now = options.now ?? Date.now;
  const names = steps.map((step) => step.name);
  if (
    names.length === 0 ||
    names.some((name) => name === '') ||
    new Set(names).size !== names.length
  ) {
    throw new TurnRunnerError(
      'A turn needs at least one step, each with a unique, non-empty name.',
    );
  }

  const turn = await store.loadTurn(orgId, turnId);
  if (turn === null) return { status: 'not_found' };
  if (TERMINAL.has(turn.status)) return { status: 'already_finished' };
  throwIfAborted(signal);
  if (!(await store.beginTurn(orgId, turnId))) return { status: 'already_finished' };
  await store.closeOlderTurns(orgId, turn);

  const finish = async (
    status: TerminalTurnStatus,
    stopReason: string | null,
  ): Promise<TurnOutcome> => {
    await store.finishTurn(orgId, turnId, status, stopReason);
    return { status, stopReason };
  };

  const outputs = new Map<string, JobJson>();
  for (const step of steps) {
    throwIfAborted(signal);
    const generation = await store.sessionGeneration(orgId, turn.sessionId);
    if (generation === null) return finish('failed', 'session_missing');
    if (generation !== turn.generation) return finish('superseded', 'generation_moved');

    const context: StepContext = { turn, outputs, signal, attempt };
    const input = step.input(context);
    const inputHash = hashInput(input);
    const stored = await store.readStep(orgId, turnId, step.name);
    if (stored !== null) {
      // A finished step is never run again. Its input must not have changed: steps build their
      // input from the turn's snapshot and earlier outputs, so a difference is a bug, not new data.
      if (stored.inputHash !== inputHash)
        return finish('failed', `step_input_changed:${step.name}`);
      outputs.set(step.name, stored.output);
      continue;
    }

    const started = now();
    let result: StepResult;
    try {
      result = await step.run(input, context);
    } catch (error) {
      const decision = decideFailure({ error, attempt, maxAttempts, aborted: signal.aborted });
      if (decision.action === 'retry') throw error;
      await store.finishTurn(orgId, turnId, decision.status, decision.stopReason);
      if (decision.rethrow) throw error;
      return { status: decision.status, stopReason: decision.stopReason };
    }
    const record: StoredStep = {
      step: step.name,
      inputHash,
      output: result.output,
      tokens: result.tokens ?? 0,
      ms: Math.max(0, Math.round(now() - started)),
    };
    // First write wins: if a stale copy of this turn recorded the step first, use its result.
    const kept = await store.recordStep(orgId, turnId, record);
    outputs.set(step.name, kept.output);
  }
  return finish('completed', null);
}
