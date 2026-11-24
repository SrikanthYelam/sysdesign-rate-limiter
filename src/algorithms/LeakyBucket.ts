import type { AcquireResult, LimiterSnapshot, RateLimiter } from './types';

/**
 * LEAKY BUCKET (queue / traffic-shaping variant)
 *
 * Incoming requests are appended to a FIFO queue of size `capacity`. The queue
 * "leaks" (forwards requests upstream) at a constant `leakRate` per second,
 * no matter how bursty the input is. If the queue is full, the request is
 * rejected.
 *
 *  - Output is perfectly smooth: upstream never sees more than `leakRate` RPS.
 *  - The price is latency: a request may wait up to capacity / leakRate seconds.
 *
 * Unlike the other algorithms, an accepted request is not forwarded right
 * away. `tryAcquire` returns `queued`, and the caller must call `advance(now)`
 * periodically to collect the requests that drip out.
 *
 * Time: O(1) per request (amortized).  Space: O(capacity).
 */
export class LeakyBucket implements RateLimiter {
  readonly id = 'leaky-bucket' as const;
  private readonly queue: string[] = [];
  private readonly intervalMs: number;
  /** Time of the last drip: the leak clock is anchored to it. */
  private lastLeak: number;

  constructor(
    private readonly capacity: number,
    private readonly leakRate: number, // requests per second
    now = 0,
  ) {
    this.intervalMs = 1000 / leakRate;
    this.lastLeak = now;
  }

  tryAcquire(requestId: string, now: number): AcquireResult {
    this.holdIdleClock(now);
    if (this.queue.length >= this.capacity) {
      // Earliest a slot frees up is the next drip.
      const retryAfterMs = Math.max(0, this.lastLeak + this.intervalMs - now);
      return { status: 'rejected', remaining: 0, retryAfterMs };
    }
    this.queue.push(requestId);
    return { status: 'queued', remaining: this.capacity - this.queue.length };
  }

  advance(now: number): string[] {
    const released: string[] = [];
    while (this.queue.length > 0 && now - this.lastLeak >= this.intervalMs) {
      released.push(this.queue.shift()!);
      this.lastLeak += this.intervalMs;
    }
    this.holdIdleClock(now);
    return released;
  }

  /**
   * While the queue is empty the leak clock must not "bank" unused drips,
   * otherwise a burst after idle time would be released all at once, which is
   * exactly what a leaky bucket is meant to prevent. Keep the clock at most one
   * interval behind `now` so the next arrival can leave right away.
   */
  private holdIdleClock(now: number): void {
    if (this.queue.length === 0) {
      this.lastLeak = Math.max(this.lastLeak, now - this.intervalMs);
    }
  }

  snapshot(now: number): LimiterSnapshot {
    const leakProgress =
      this.queue.length === 0 ? 0 : Math.min(1, Math.max(0, (now - this.lastLeak) / this.intervalMs));
    return {
      kind: 'leaky-bucket',
      queue: this.queue.slice(),
      capacity: this.capacity,
      leakRate: this.leakRate,
      leakProgress,
    };
  }
}
