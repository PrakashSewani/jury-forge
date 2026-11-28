// The `TurnStore` port over `session_turns`, `turn_steps`, and `pr_sessions` (WP 1-11). Every
// call goes through the tenant scope of its org (ADR-0035).

import type {
  JobJson,
  StoredStep,
  TerminalTurnStatus,
  TurnRecord,
  TurnStatus,
  TurnStore,
} from '@jury-forge/contracts';
import type { Store } from './store.ts';

const OPEN: TurnStatus[] = ['queued', 'running'];

export function createTurnStore(store: Store): TurnStore {
  async function readStep(orgId: string, turnId: string, step: string): Promise<StoredStep | null> {
    const row = await store
      .forOrg(orgId)
      .selectFrom('turn_steps')
      .select(['step', 'input_hash', 'output', 'tokens', 'ms'])
      .where('turn_id', '=', turnId)
      .where('step', '=', step)
      .executeTakeFirst();
    if (row === undefined) return null;
    return {
      step: row.step,
      inputHash: row.input_hash,
      output: (row.output ?? null) as JobJson,
      tokens: Number(row.tokens),
      ms: row.ms,
    };
  }

  return {
    async loadTurn(orgId, turnId) {
      const row = await store
        .forOrg(orgId)
        .selectFrom('session_turns')
        .select(['id', 'session_id', 'generation', 'status'])
        .where('id', '=', turnId)
        .executeTakeFirst();
      if (row === undefined) return null;
      return {
        orgId,
        turnId: row.id,
        sessionId: row.session_id,
        generation: row.generation,
        status: row.status as TurnStatus,
      };
    },

    async sessionGeneration(orgId, sessionId) {
      const row = await store
        .forOrg(orgId)
        .selectFrom('pr_sessions')
        .select('generation')
        .where('id', '=', sessionId)
        .executeTakeFirst();
      return row?.generation ?? null;
    },

    async beginTurn(orgId, turnId) {
      const scope = store.forOrg(orgId);
      const result = await scope
        .update('session_turns', { status: 'running' })
        .where('id', '=', turnId)
        .where('status', 'in', OPEN)
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) return false;
      // The first start only; a retry keeps the original start time.
      await scope
        .update('session_turns', { started_at: new Date() })
        .where('id', '=', turnId)
        .where('started_at', 'is', null)
        .execute();
      return true;
    },

    async closeOlderTurns(orgId, turn: TurnRecord) {
      const scope = store.forOrg(orgId);
      const finishedAt = new Date();
      const createdAt = await scope
        .selectFrom('session_turns')
        .select('created_at')
        .where('id', '=', turn.turnId)
        .executeTakeFirst();
      if (createdAt === undefined) return 0;
      const before = createdAt.created_at;

      // A queued older turn never ran: its trigger was coalesced into this turn.
      const coalesced = await scope
        .update('session_turns', {
          status: 'superseded',
          stop_reason: 'coalesced',
          finished_at: finishedAt,
        })
        .where('session_id', '=', turn.sessionId)
        .where('id', '<>', turn.turnId)
        .where('status', '=', 'queued')
        .where('created_at', '<', before)
        .executeTakeFirst();
      // A running older turn lost its job (a crash, or a trigger that replaced its job).
      const moved = await scope
        .update('session_turns', {
          status: 'superseded',
          stop_reason: 'generation_moved',
          finished_at: finishedAt,
        })
        .where('session_id', '=', turn.sessionId)
        .where('id', '<>', turn.turnId)
        .where('status', '=', 'running')
        .where('created_at', '<', before)
        .where('generation', '<', turn.generation)
        .executeTakeFirst();
      const orphaned = await scope
        .update('session_turns', {
          status: 'failed',
          stop_reason: 'orphaned',
          finished_at: finishedAt,
        })
        .where('session_id', '=', turn.sessionId)
        .where('id', '<>', turn.turnId)
        .where('status', '=', 'running')
        .where('created_at', '<', before)
        .executeTakeFirst();
      return Number(coalesced.numUpdatedRows + moved.numUpdatedRows + orphaned.numUpdatedRows);
    },

    readStep,

    async recordStep(orgId, turnId, step: StoredStep) {
      await store
        .forOrg(orgId)
        .insertInto('turn_steps', {
          turn_id: turnId,
          step: step.step,
          input_hash: step.inputHash,
          // JSON text, so that arrays stay JSON and do not become Postgres arrays.
          output: JSON.stringify(step.output),
          tokens: step.tokens,
          ms: step.ms,
        })
        .onConflict((oc) => oc.columns(['turn_id', 'step']).doNothing())
        .execute();
      const kept = await readStep(orgId, turnId, step.step);
      if (kept === null) throw new Error(`turn step ${step.step} was not recorded`);
      return kept;
    },

    async finishTurn(orgId, turnId, status: TerminalTurnStatus, stopReason) {
      const scope = store.forOrg(orgId);
      const totals = await scope
        .selectFrom('turn_steps')
        .select((eb) => eb.fn.coalesce(eb.fn.sum<string>('tokens'), eb.lit(0)).as('tokens'))
        .where('turn_id', '=', turnId)
        .executeTakeFirstOrThrow();
      const result = await scope
        .update('session_turns', {
          status,
          stop_reason: stopReason,
          finished_at: new Date(),
          tokens: String(totals.tokens),
        })
        .where('id', '=', turnId)
        .where('status', 'in', OPEN)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },
  };
}
