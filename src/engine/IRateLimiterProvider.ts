import type { LimiterConfig, LimiterSnapshot } from '../algorithms';

/** The outcome the gateway returns for a single request. */
export interface RateLimitDecision {
  requestId: string;
  allowed: boolean;
  statusCode: 200 | 429;
  /** Remaining quota after this decision, when the provider knows it. */
  remaining?: number;
  /** Value for a `Retry-After` header on 429 responses. */
  retryAfterMs?: number;
  /** Time spent waiting in a queue before being forwarded (Leaky Bucket). */
  queuedMs?: number;
  /** Provider clock time (ms) at which the decision was made. */
  decidedAt: number;
  /** Which gateway instance answered (remote provider only). */
  servedBy?: string;
}

/** Internal limiter state plus the provider clock it was sampled at. */
export interface ProviderSnapshot {
  now: number;
  state: LimiterSnapshot;
}

/**
 * Strategy interface the UI talks to. The UI never touches an algorithm
 * directly, so swapping the in-browser engine (Phase 1) for a real
 * .NET + Redis backend (Phase 2) is a matter of choosing another provider.
 */
export interface IRateLimiterProvider {
  readonly kind: 'client' | 'remote';
  /** Apply a new algorithm / parameter set. Resets limiter state. */
  configure(config: LimiterConfig): Promise<void>;
  /** Ask the gateway whether a request may pass. May resolve later if the request is queued. */
  evaluateRequest(requestId: string): Promise<RateLimitDecision>;
  /** Live internal state for visualization, or null if the provider cannot expose it. */
  getSnapshot(): ProviderSnapshot | null;
  /** Release timers, connections and pending requests. */
  dispose(): void;
}
