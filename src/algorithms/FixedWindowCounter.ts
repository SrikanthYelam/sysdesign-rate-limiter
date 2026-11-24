import type { AcquireResult, LimiterSnapshot, RateLimiter } from './types';

/**
 * FIXED WINDOW COUNTER
 *
 * Time is cut into consecutive, non-overlapping windows of `windowMs`
 * (e.g. 12:00:00-12:00:05, 12:00:05-12:00:10, ...). Each window has a counter;
 * a request is allowed while the counter is below `limit`. The counter resets
 * to zero when a new window begins.
 *
 *  - Extremely cheap: one integer per client (maps to Redis INCR + EXPIRE).
 *  - Boundary burst problem: a client can send `limit` requests at the very end
 *    of one window and `limit` more at the start of the next, i.e. up to
 *    2 x limit requests within a span of just over one window.
 *
 * Time: O(1) per request.  Space: O(1) per client.
 */
export class FixedWindowCounter implements RateLimiter {
  readonly id = 'fixed-window' as const;
  private windowStart: number;
  private count = 0;

  constructor(
    private readonly windowMs: number,
    private readonly limit: number,
    now = 0,
  ) {
    this.windowStart = this.alignToWindow(now);
  }

  /** Windows are aligned to the clock, like `floor(epoch / window)` keys in Redis. */
  private alignToWindow(now: number): number {
    return Math.floor(now / this.windowMs) * this.windowMs;
  }

  private roll(now: number): void {
    if (now >= this.windowStart + this.windowMs) {
      this.windowStart = this.alignToWindow(now);
      this.count = 0;
    }
  }

  tryAcquire(_requestId: string, now: number): AcquireResult {
    this.roll(now);
    if (this.count < this.limit) {
      this.count += 1;
      return { status: 'allowed', remaining: this.limit - this.count };
    }
    return { status: 'rejected', remaining: 0, retryAfterMs: this.windowStart + this.windowMs - now };
  }

  advance(now: number): string[] {
    this.roll(now);
    return [];
  }

  snapshot(now: number): LimiterSnapshot {
    this.roll(now);
    return {
      kind: 'fixed-window',
      windowStart: this.windowStart,
      windowMs: this.windowMs,
      count: this.count,
      limit: this.limit,
    };
  }
}
