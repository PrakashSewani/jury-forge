import type {
  JobJson,
  StoredStep,
  TerminalTurnStatus,
  TurnRecord,
  TurnStore,
} from '@jury-forge/contracts';
import { StepFailure } from '@jury-forge/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runTurn, TurnRunnerError, type TurnStep } from './run-turn.ts';

/** An in-memory TurnStore with the same semantics as the store implementation. */
class MemoryTurnStore implements TurnStore {
  turns = new Map<string, TurnRecord & { stopReason: string | null }>();
  generations = new Map<string, number>();
  steps = new Map<string, StoredStep>();
  closedOlder = 0;

  constructor(turn: TurnRecord, generation = turn.generation) {
    this.turns.set(turn.turnId, { ...turn, stopReason: null });
    this.generations.set(turn.sessionId, generation);
  }
  async loadTurn(_orgId: string, turnId: string) {
    const turn = this.turns.get(turnId);
    return turn
      ? {
          orgId: turn.orgId,
          turnId: turn.turnId,
          sessionId: turn.sessionId,
          generation: turn.generation,
          status: turn.status,
        }
      : null;
  }
  async sessionGeneration(_orgId: string, sessionId: string) {
    return this.generations.get(sessionId) ?? null;
  }
  async beginTurn(_orgId: string, turnId: string) {
    const turn = this.turns.get(turnId);
    if (!turn || (turn.status !== 'queued' && turn.status !== 'running')) return false;
    turn.status = 'running';
    return true;
  }
  async closeOlderTurns() {
    this.closedOlder++;
    return 0;
  }
  async readStep(_orgId: string, turnId: string, step: string) {
    return this.steps.get(`${turnId}/${step}`) ?? null;
  }
  async recordStep(_orgId: string, turnId: string, step: StoredStep) {
    const key = `${turnId}/${step.step}`;
    const existing = this.steps.get(key);
    if (existing) return existing;
    this.steps.set(key, step);
    return step;
  }
  async finishTurn(
    _orgId: string,
    turnId: string,
    status: TerminalTurnStatus,
    stopReason: string | null,
  ) {
    const turn = this.turns.get(turnId);
    if (!turn || (turn.status !== 'queued' && turn.status !== 'running')) return false;
    turn.status = status;
    turn.stopReason = stopReason;
    return true;
  }
}

const TURN: TurnRecord = {
  orgId: 'org',
  turnId: 'turn-1',
  sessionId: 'session-1',
  generation: 2,
  status: 'queued',
};

/** Steps that count each run and each effect; `crashAt` simulates a worker dying inside a step. */
function countingSteps(
  names: string[],
  effects: Map<string, number>,
  runs: Map<string, number>,
  crashAt?: string,
): TurnStep[] {
  return names.map((name) => ({
    name,
    input: (context) => ({ step: name, before: [...context.outputs.keys()] }),
    async run(_input, context) {
      runs.set(name, (runs.get(name) ?? 0) + 1);
      // An idempotent effect keyed by (turn, step), as every effect outside the database must be.
      effects.set(`${context.turn.turnId}/${name}`, 1);
      if (name === crashAt) throw new Error('worker died');
      return { output: { done: name }, tokens: 10 };
    },
  }));
}

const options = (
  store: TurnStore,
  steps: TurnStep[],
  attempt = 1,
  signal = new AbortController().signal,
) => ({
  store,
  orgId: 'org',
  turnId: 'turn-1',
  steps,
  attempt,
  maxAttempts: 3,
  signal,
});

describe('runTurn', () => {
  it('runs every step once, records each result, and completes the turn', async () => {
    const store = new MemoryTurnStore(TURN);
    const effects = new Map<string, number>();
    const runs = new Map<string, number>();
    const outcome = await runTurn(
      options(store, countingSteps(['resolve', 'fetch', 'publish'], effects, runs)),
    );
    expect(outcome).toEqual({ status: 'completed', stopReason: null });
    expect([...runs.values()]).toEqual([1, 1, 1]);
    expect([...store.steps.keys()]).toEqual(['turn-1/resolve', 'turn-1/fetch', 'turn-1/publish']);
    expect(store.steps.get('turn-1/fetch')?.tokens).toBe(10);
    expect(store.closedOlder).toBe(1);
    expect(store.turns.get('turn-1')?.status).toBe('completed');
  });

  it('after a crash, skips the finished steps and resumes at the one that died', async () => {
    const store = new MemoryTurnStore(TURN);
    const effects = new Map<string, number>();
    const runs = new Map<string, number>();
    await expect(
      runTurn(options(store, countingSteps(['a', 'b', 'c'], effects, runs, 'b'))),
    ).rejects.toThrow('worker died');
    expect(store.turns.get('turn-1')?.status).toBe('running');
    const outcome = await runTurn(options(store, countingSteps(['a', 'b', 'c'], effects, runs), 2));
    expect(outcome.status).toBe('completed');
    expect(Object.fromEntries(runs)).toEqual({ a: 1, b: 2, c: 1 });
    expect(effects.size).toBe(3);
  });

  it('completes with every effect once, wherever and however often it crashes (property)', async () => {
    const names = ['resolve', 'fetch', 'plan', 'review', 'ground', 'publish'];
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom(...names), { maxLength: 4 }), async (crashes) => {
        const store = new MemoryTurnStore(TURN);
        const effects = new Map<string, number>();
        const runs = new Map<string, number>();
        let attempt = 1;
        for (const crashAt of crashes) {
          await runTurn({
            ...options(store, countingSteps(names, effects, runs, crashAt), attempt),
            maxAttempts: 10,
          }).catch(() => {});
          attempt++;
        }
        await runTurn({
          ...options(store, countingSteps(names, effects, runs), attempt),
          maxAttempts: 10,
        });
        expect(store.turns.get('turn-1')?.status).toBe('completed');
        expect(effects.size).toBe(names.length);
        expect(store.steps.size).toBe(names.length);

        // The model: an attempt skips recorded steps and runs the rest until one crashes. A planned
        // crash in a step that is already recorded never happens, because that step does not run.
        const expected = new Map<string, number>();
        const recorded = new Set<string>();
        for (const crashAt of [...crashes, undefined]) {
          for (const name of names) {
            if (recorded.has(name)) continue;
            expected.set(name, (expected.get(name) ?? 0) + 1);
            if (name === crashAt) break;
            recorded.add(name);
          }
        }
        expect(Object.fromEntries(runs)).toEqual(Object.fromEntries(expected));
      }),
    );
  });

  it('ends the turn as superseded when the session generation moved, before the next step', async () => {
    const store = new MemoryTurnStore(TURN);
    const runs = new Map<string, number>();
    const steps = countingSteps(['a', 'b'], new Map(), runs);
    const first = steps[0] as TurnStep;
    steps[0] = {
      ...first,
      async run(input, context) {
        store.generations.set('session-1', 3); // a push arrived while the step ran
        return first.run(input, context);
      },
    };
    expect(await runTurn(options(store, steps))).toEqual({
      status: 'superseded',
      stopReason: 'generation_moved',
    });
    expect(Object.fromEntries(runs)).toEqual({ a: 1 });
    expect(store.turns.get('turn-1')?.status).toBe('superseded');
  });

  it('rethrows an abort without writing an outcome, at a step boundary or inside a step', async () => {
    const store = new MemoryTurnStore(TURN);
    const controller = new AbortController();
    const steps: TurnStep[] = [
      { name: 'a', input: () => null, run: async () => ({ output: 'a' }) },
      {
        name: 'b',
        input: () => null,
        run: async (_input, context) => {
          controller.abort(new Error('shutting down'));
          throw context.signal.reason;
        },
      },
    ];
    await expect(runTurn(options(store, steps, 3, controller.signal))).rejects.toThrow(
      'shutting down',
    );
    expect(store.turns.get('turn-1')?.status).toBe('running');
    await expect(runTurn(options(store, steps, 1, controller.signal))).rejects.toThrow(
      'shutting down',
    );
  });

  it('applies the retry policy: transient retries, terminal and budget end the turn', async () => {
    const failing = (error: unknown): TurnStep[] => [
      {
        name: 'a',
        input: () => null,
        run: async () => {
          throw error;
        },
      },
    ];

    const transient = new MemoryTurnStore(TURN);
    await expect(
      runTurn(options(transient, failing(new StepFailure('transient', 'provider_5xx')), 1)),
    ).rejects.toThrow();
    expect(transient.turns.get('turn-1')?.status).toBe('running');
    await expect(
      runTurn(options(transient, failing(new StepFailure('transient', 'provider_5xx')), 3)),
    ).rejects.toThrow();
    expect(transient.turns.get('turn-1')).toMatchObject({
      status: 'failed',
      stopReason: 'provider_5xx',
    });

    const terminal = new MemoryTurnStore(TURN);
    expect(
      await runTurn(options(terminal, failing(new StepFailure('terminal', 'provider_auth')))),
    ).toEqual({
      status: 'failed',
      stopReason: 'provider_auth',
    });
    const budget = new MemoryTurnStore(TURN);
    expect(await runTurn(options(budget, failing(new StepFailure('budget', 'turn_cap'))))).toEqual({
      status: 'budget_stopped',
      stopReason: 'turn_cap',
    });
  });

  it('fails the turn when a recorded step’s input has changed, and when the session is gone', async () => {
    const changed = new MemoryTurnStore(TURN);
    await changed.recordStep('org', 'turn-1', {
      step: 'a',
      inputHash: 'not-the-hash',
      output: 'old',
      tokens: 0,
      ms: 0,
    });
    const steps: TurnStep[] = [
      { name: 'a', input: () => ({ v: 1 }), run: async () => ({ output: 'new' }) },
    ];
    expect(await runTurn(options(changed, steps))).toEqual({
      status: 'failed',
      stopReason: 'step_input_changed:a',
    });

    const orphan = new MemoryTurnStore(TURN);
    orphan.generations.clear();
    expect(await runTurn(options(orphan, steps))).toEqual({
      status: 'failed',
      stopReason: 'session_missing',
    });
  });

  it('does nothing for a missing or finished turn, and keeps the first recorded result', async () => {
    const store = new MemoryTurnStore(TURN);
    const steps: TurnStep[] = [
      { name: 'a', input: () => null, run: async () => ({ output: 'mine' as JobJson }) },
    ];
    expect(await runTurn({ ...options(store, steps), turnId: 'nope' })).toEqual({
      status: 'not_found',
    });

    const raced = new MemoryTurnStore(TURN);
    const original = raced.recordStep.bind(raced);
    raced.recordStep = async (orgId, turnId, step) => {
      await original(orgId, turnId, { ...step, output: 'theirs' }); // a stale copy recorded first
      return original(orgId, turnId, step);
    };
    const outputs: JobJson[] = [];
    const recorder: TurnStep[] = [
      ...steps,
      {
        name: 'b',
        input: (context) => context.outputs.get('a') ?? null,
        run: async (input) => {
          outputs.push(input);
          return { output: null };
        },
      },
    ];
    expect((await runTurn(options(raced, recorder))).status).toBe('completed');
    expect(outputs).toEqual(['theirs']);

    expect(await runTurn(options(store, steps))).toEqual({ status: 'completed', stopReason: null });
    expect(await runTurn(options(store, steps))).toEqual({ status: 'already_finished' });
  });

  it('handles an abort with a non-Error reason, and a turn finished between load and begin', async () => {
    const step: TurnStep = { name: 'a', input: () => null, run: async () => ({ output: null }) };
    const controller = new AbortController();
    controller.abort('stop');
    await expect(
      runTurn(options(new MemoryTurnStore(TURN), [step], 1, controller.signal)),
    ).rejects.toThrow('The turn was aborted.');
    const raced = new MemoryTurnStore(TURN);
    raced.beginTurn = async () => false; // another job finished the turn after it was loaded
    expect(await runTurn(options(raced, [step]))).toEqual({ status: 'already_finished' });
  });

  it('refuses a turn without steps or with duplicate names', async () => {
    const store = new MemoryTurnStore(TURN);
    const step: TurnStep = { name: 'a', input: () => null, run: async () => ({ output: null }) };
    await expect(runTurn(options(store, []))).rejects.toThrow(TurnRunnerError);
    await expect(runTurn(options(store, [step, step]))).rejects.toThrow(TurnRunnerError);
    await expect(runTurn(options(store, [{ ...step, name: '' }]))).rejects.toThrow(TurnRunnerError);
  });
});
