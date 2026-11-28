import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideFailure, StepFailure } from './retry-policy.ts';

const decide = (error: unknown, attempt = 1, maxAttempts = 3, aborted = false) =>
  decideFailure({ error, attempt, maxAttempts, aborted });

describe('decideFailure', () => {
  it('retries a transient failure while attempts remain, then fails and rethrows', () => {
    const error = new StepFailure('transient', 'provider_unavailable');
    expect(decide(error, 1, 3)).toEqual({ action: 'retry', reason: 'provider_unavailable' });
    expect(decide(error, 2, 3)).toEqual({ action: 'retry', reason: 'provider_unavailable' });
    expect(decide(error, 3, 3)).toEqual({
      action: 'finish',
      status: 'failed',
      stopReason: 'provider_unavailable',
      rethrow: true,
    });
  });

  it('treats an error that is not a StepFailure as a transient internal error', () => {
    expect(decide(new Error('boom'), 1, 2)).toEqual({ action: 'retry', reason: 'internal_error' });
    expect(decide('not even an Error', 2, 2)).toEqual({
      action: 'finish',
      status: 'failed',
      stopReason: 'internal_error',
      rethrow: true,
    });
  });

  it('ends the turn at once on a terminal failure, without a queue retry', () => {
    expect(decide(new StepFailure('terminal', 'provider_auth'), 1, 3)).toEqual({
      action: 'finish',
      status: 'failed',
      stopReason: 'provider_auth',
      rethrow: false,
    });
  });

  it('stops the turn as budget_stopped on a budget failure (fail closed)', () => {
    expect(decide(new StepFailure('budget', 'turn_token_budget'), 1, 3)).toEqual({
      action: 'finish',
      status: 'budget_stopped',
      stopReason: 'turn_token_budget',
      rethrow: false,
    });
  });

  it('never finishes the turn after an abort, whatever the failure or attempt', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<unknown>(
          new StepFailure('terminal', 'x'),
          new StepFailure('budget', 'y'),
          new StepFailure('transient', 'z'),
          new Error('e'),
        ),
        fc.integer({ min: 1, max: 10 }),
        (error, attempt) => {
          expect(decide(error, attempt, attempt, true)).toEqual({
            action: 'retry',
            reason: 'aborted',
          });
        },
      ),
    );
  });

  it('rejects impossible attempt numbers and empty reasons', () => {
    for (const [attempt, maxAttempts] of [
      [0, 3],
      [1, 0],
      [1.5, 3],
      [1, Number.NaN],
    ] as const) {
      expect(() => decide(new Error('x'), attempt, maxAttempts)).toThrow(RangeError);
    }
    expect(() => new StepFailure('terminal', '')).toThrow(RangeError);
    const withCause = new StepFailure('transient', 'db', 'database unavailable', { cause: 'c' });
    expect(withCause.message).toBe('database unavailable');
    expect(withCause.cause).toBe('c');
  });
});
