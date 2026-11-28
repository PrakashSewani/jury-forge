import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createTokenBucket, type TokenBucket, takeToken } from './token-bucket.ts';

function takeMany(bucket: TokenBucket, times: number[]): { taken: number; bucket: TokenBucket } {
  let state = bucket;
  let taken = 0;
  for (const time of times) {
    const result = takeToken(state, time);
    state = result.bucket;
    if (result.taken) taken += 1;
  }
  return { taken, bucket: state };
}

describe('token bucket', () => {
  it('allows a burst of capacity, then one per period / capacity', () => {
    const start = createTokenBucket(5, 120_000, 0);
    const burst = takeMany(start, [0, 0, 0, 0, 0, 0]);
    expect(burst.taken).toBe(5);
    expect(takeToken(burst.bucket, 23_999).taken).toBe(false);
    expect(takeToken(burst.bucket, 24_000).taken).toBe(true);
  });

  it('refills to capacity and no further', () => {
    const empty = takeMany(createTokenBucket(5, 120_000, 0), [0, 0, 0, 0, 0]).bucket;
    expect(takeMany(empty, Array(10).fill(10 * 60_000)).taken).toBe(5);
  });

  it('refills nothing when the clock goes backwards', () => {
    const empty = takeMany(createTokenBucket(1, 1000, 5000), [5000]).bucket;
    expect(takeToken(empty, 0).taken).toBe(false);
    expect(takeToken(empty, 0).bucket.updatedAt).toBe(5000);
  });

  it('rejects a bad capacity or period', () => {
    expect(() => createTokenBucket(0, 1000, 0)).toThrow(RangeError);
    expect(() => createTokenBucket(1.5, 1000, 0)).toThrow(RangeError);
    expect(() => createTokenBucket(1, 0, 0)).toThrow(RangeError);
    expect(() => createTokenBucket(1, Number.NaN, 0)).toThrow(RangeError);
  });

  it('never grants more than capacity + elapsed * rate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1000, max: 600_000 }),
        fc.array(fc.integer({ min: 0, max: 60_000 }), { maxLength: 200 }),
        (capacity, periodMs, gaps) => {
          let now = 0;
          const times = gaps.map((gap) => {
            now += gap;
            return now;
          });
          const { taken } = takeMany(createTokenBucket(capacity, periodMs, 0), times);
          expect(taken).toBeLessThanOrEqual(capacity + Math.floor((now * capacity) / periodMs));
        },
      ),
    );
  });
});
