// The `TurnStore` port: the persistence the turn runner needs (job-pipeline.md, "Turn lifecycle"
// and "Idempotency rules"). `store` implements it over `session_turns`, `turn_steps`, and
// `pr_sessions`; every call names its org (ADR-0035).

import type { JobJson } from './job-queue.ts';

export type TerminalTurnStatus = 'completed' | 'failed' | 'superseded' | 'budget_stopped';
export type TurnStatus = 'queued' | 'running' | TerminalTurnStatus;

export interface TurnRecord {
  orgId: string;
  turnId: string;
  sessionId: string;
  /** The session generation the turn was created for (ADR-0024). */
  generation: number;
  status: TurnStatus;
}

/** A finished step: its result is read back on a retry instead of running the step again. */
export interface StoredStep {
  step: string;
  /** Hex SHA-256 of the canonical JSON of the step's input. */
  inputHash: string;
  output: JobJson;
  tokens: number;
  ms: number;
}

export interface TurnStore {
  loadTurn(orgId: string, turnId: string): Promise<TurnRecord | null>;
  /** The session's current generation, or null if the session does not exist. */
  sessionGeneration(orgId: string, sessionId: string): Promise<number | null>;
  /** Marks a queued or running turn as running. False when the turn has already finished. */
  beginTurn(orgId: string, turnId: string): Promise<boolean>;
  /**
   * Closes the session's older turns that never finished (spike S-A R2): a queued one was
   * coalesced into this turn (`superseded`), a running one lost its job (`superseded` when the
   * generation moved, otherwise `failed`). Returns how many it closed.
   */
  closeOlderTurns(orgId: string, turn: TurnRecord): Promise<number>;
  readStep(orgId: string, turnId: string, step: string): Promise<StoredStep | null>;
  /** Records a finished step; if one is already recorded, keeps it and returns it (first write wins). */
  recordStep(orgId: string, turnId: string, step: StoredStep): Promise<StoredStep>;
  /** Ends a turn that has not finished; false when it had already finished. */
  finishTurn(
    orgId: string,
    turnId: string,
    status: TerminalTurnStatus,
    stopReason: string | null,
  ): Promise<boolean>;
}
