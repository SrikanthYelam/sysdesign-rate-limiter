import type { AcquireResult, LimiterSnapshot, RateLimiter } from './types';

/**
 * SLIDING WINDOW LOG
 *
 * Keep a timestamp for every accepted request. On each new request, evict
 * timestamps older than `now - windowMs`; if fewer than `limit` remain, accept
 * and record the new timestamp.
 *
 *  - Exact: the limit holds for EVERY window of length `windowMs`, so there is
 *    no boundary burst (contrast with Fixed Window).
 *  - Memory grows with the limit: up to `limit` timestamps per client
 *    (maps to a Redis sorted set: ZREMRANGEBYSCORE + ZCARD + ZADD).
 *
 * Only accepted requests are logged here. Some implementations also log
 * rejected ones, which punishes clients that keep retrying while throttled.
 *
 * Time: O(log n) per request with a sorted set (amortized O(1) here, since
 * timestamps arrive in order and are evicted from the front). Space: O(limit).
 */
export class SlidingWindowLog implements RateLimiter {
  readonly id = 'sliding-window-log' as const;
  private log: number[] = [];

  constructor(
    private readonly windowMs: number,
    private readonly limit: number,
  ) {}

  private evict(now: number): void {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.log.length && this.log[i] <= cutoff) i++;
    if (i > 0) this.log = this.log.slice(i);
  }

  tryAcquire(_requestId: string, now: number): AcquireResult {
    this.evict(now);
    if (this.log.length < this.limit) {
      this.log.push(now);
      return { status: 'allowed', remaining: this.limit - this.log.length };
    }
    // The oldest entry must age out before another request fits.
    return { status: 'rejected', remaining: 0, retryAfterMs: this.log[0] + this.windowMs - now };
  }

  advance(now: number): string[] {
    this.evict(now);
    return [];
  }

  snapshot(now: number): LimiterSnapshot {
    this.evict(now);
    return { kind: 'sliding-window-log', log: this.log.slice(), windowMs: this.windowMs, limit: this.limit };
  }
}
