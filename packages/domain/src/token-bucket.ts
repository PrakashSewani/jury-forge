// A token bucket with an injected clock: `capacity` tokens, refilled continuously at
// `capacity / periodMs`. Pure: the caller keeps the state and passes the time.

export interface TokenBucket {
  readonly capacity: number;
  readonly periodMs: number;
  readonly tokens: number;
  readonly updatedAt: number;
}

export function createTokenBucket(capacity: number, periodMs: number, now: number): TokenBucket {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('capacity must be an integer of at least 1');
  }
  if (!Number.isFinite(periodMs) || periodMs <= 0)
    throw new RangeError('periodMs must be positive');
  return { capacity, periodMs, tokens: capacity, updatedAt: now };
}

/** Takes one token if there is one. A clock that goes backwards refills nothing. */
export function takeToken(
  bucket: TokenBucket,
  now: number,
): { taken: boolean; bucket: TokenBucket } {
  const elapsed = Math.max(0, now - bucket.updatedAt);
  const tokens = Math.min(
    bucket.capacity,
    bucket.tokens + (elapsed * bucket.capacity) / bucket.periodMs,
  );
  const updatedAt = Math.max(now, bucket.updatedAt);
  if (tokens < 1) return { taken: false, bucket: { ...bucket, tokens, updatedAt } };
  return { taken: true, bucket: { ...bucket, tokens: tokens - 1, updatedAt } };
}
