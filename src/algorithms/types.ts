/**
 * Shared contracts for the pure rate-limiting algorithms.
 *
 * Every algorithm is a plain class with NO dependency on React, timers, or the
 * browser. Time is always passed in explicitly as `now` (milliseconds), which
 * makes the algorithms deterministic and trivially unit-testable: the caller
 * owns the clock.
 */

export type AlgorithmId = 'token-bucket' | 'leaky-bucket' | 'fixed-window' | 'sliding-window-log';

/**
 * - `allowed`  : request may proceed immediately (HTTP 200).
 * - `rejected` : request is throttled (HTTP 429).
 * - `queued`   : request was accepted into a buffer and will be released later
 *                by `advance()` (only the Leaky Bucket queues).
 */
export type AcquireStatus = 'allowed' | 'rejected' | 'queued';

export interface AcquireResult {
  status: AcquireStatus;
  /** Requests still permitted before throttling kicks in (best effort). */
  remaining: number;
  /** For rejections: how long until a retry could succeed (`Retry-After`). */
  retryAfterMs?: number;
}

/** Read-only view of internal state, used purely for visualization. */
export type LimiterSnapshot =
  | { kind: 'token-bucket'; tokens: number; capacity: number; refillRate: number }
  | { kind: 'leaky-bucket'; queue: readonly string[]; capacity: number; leakRate: number; leakProgress: number }
  | { kind: 'fixed-window'; windowStart: number; windowMs: number; count: number; limit: number }
  | { kind: 'sliding-window-log'; log: readonly number[]; windowMs: number; limit: number };

export interface RateLimiter {
  readonly id: AlgorithmId;
  /** Decide what to do with a request arriving at time `now`. */
  tryAcquire(requestId: string, now: number): AcquireResult;
  /**
   * Move the clock forward. Returns ids of previously queued requests that are
   * released at this point (always empty for non-queueing algorithms).
   */
  advance(now: number): string[];
  snapshot(now: number): LimiterSnapshot;
}
