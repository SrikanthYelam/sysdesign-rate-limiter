import { createLimiter, type LimiterConfig, type RateLimiter } from '../algorithms';
import type { IRateLimiterProvider, ProviderSnapshot, RateLimitDecision } from './IRateLimiterProvider';

/** How often queued requests are checked for release (only matters for Leaky Bucket). */
const TICK_MS = 10;

interface PendingRequest {
  resolve: (decision: RateLimitDecision) => void;
  enqueuedAt: number;
}

/**
 * Phase 1 provider: runs one of the pure algorithms in the browser.
 *
 * It owns the simulation clock (ms since construction) and a small ticker that
 * drains queued requests, resolving their promises when they "leak" upstream.
 */
export class ClientSimulationProvider implements IRateLimiterProvider {
  readonly kind = 'client' as const;
  private readonly origin = performance.now();
  private limiter: RateLimiter;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly timer: number;

  constructor(config: LimiterConfig) {
    this.limiter = createLimiter(config, this.now());
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private now(): number {
    return performance.now() - this.origin;
  }

  async configure(config: LimiterConfig): Promise<void> {
    // Requests waiting in the old limiter's queue are dropped with it.
    this.rejectAllPending();
    this.limiter = createLimiter(config, this.now());
  }

  evaluateRequest(requestId: string): Promise<RateLimitDecision> {
    const now = this.now();
    const result = this.limiter.tryAcquire(requestId, now);

    if (result.status === 'queued') {
      return new Promise((resolve) => this.pending.set(requestId, { resolve, enqueuedAt: now }));
    }
    const allowed = result.status === 'allowed';
    return Promise.resolve({
      requestId,
      allowed,
      statusCode: allowed ? 200 : 429,
      remaining: result.remaining,
      retryAfterMs: result.retryAfterMs,
      decidedAt: now,
    });
  }

  private tick(): void {
    const now = this.now();
    for (const id of this.limiter.advance(now)) {
      const entry = this.pending.get(id);
      if (!entry) continue;
      this.pending.delete(id);
      entry.resolve({ requestId: id, allowed: true, statusCode: 200, queuedMs: now - entry.enqueuedAt, decidedAt: now });
    }
  }

  private rejectAllPending(): void {
    const now = this.now();
    for (const [id, entry] of this.pending) {
      entry.resolve({ requestId: id, allowed: false, statusCode: 429, decidedAt: now });
    }
    this.pending.clear();
  }

  getSnapshot(): ProviderSnapshot {
    const now = this.now();
    return { now, state: this.limiter.snapshot(now) };
  }

  dispose(): void {
    window.clearInterval(this.timer);
    this.rejectAllPending();
  }
}
