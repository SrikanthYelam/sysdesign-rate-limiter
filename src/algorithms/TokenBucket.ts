import type { AcquireResult, LimiterSnapshot, RateLimiter } from './types';

/**
 * TOKEN BUCKET
 *
 * A bucket holds up to `capacity` tokens and is refilled continuously at
 * `refillRate` tokens/second. Each request must take one token; if the bucket
 * is empty the request is rejected.
 *
 *  - Allows bursts up to `capacity`, then enforces the long-run average rate.
 *  - Refill is computed lazily from elapsed time, so no background timer is
 *    needed: state is just two numbers (`tokens`, `lastRefill`).
 *
 * Time: O(1) per request.  Space: O(1) per client.
 */
export class TokenBucket implements RateLimiter {
  readonly id = 'token-bucket' as const;
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number, // tokens per second
    now = 0,
  ) {
    this.tokens = capacity; // start full: a fresh client may burst immediately
    this.lastRefill = now;
  }

  /** Lazily add the tokens that accrued since the last call. */
  private refill(now: number): void {
    const elapsedSec = Math.max(0, now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRate);
    this.lastRefill = now;
  }

  tryAcquire(_requestId: string, now: number): AcquireResult {
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { status: 'allowed', remaining: Math.floor(this.tokens) };
    }
    // Time until the bucket holds one whole token again.
    const retryAfterMs = ((1 - this.tokens) / this.refillRate) * 1000;
    return { status: 'rejected', remaining: 0, retryAfterMs };
  }

  advance(now: number): string[] {
    this.refill(now);
    return [];
  }

  snapshot(now: number): LimiterSnapshot {
    this.refill(now);
    return { kind: 'token-bucket', tokens: this.tokens, capacity: this.capacity, refillRate: this.refillRate };
  }
}
