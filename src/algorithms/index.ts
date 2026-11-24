import { FixedWindowCounter } from './FixedWindowCounter';
import { LeakyBucket } from './LeakyBucket';
import { SlidingWindowLog } from './SlidingWindowLog';
import { TokenBucket } from './TokenBucket';
import type { RateLimiter } from './types';

export * from './types';
export { FixedWindowCounter, LeakyBucket, SlidingWindowLog, TokenBucket };

/** Serializable configuration: the same shape a remote backend would accept. */
export type LimiterConfig =
  | { algorithm: 'token-bucket'; capacity: number; refillRate: number }
  | { algorithm: 'leaky-bucket'; capacity: number; leakRate: number }
  | { algorithm: 'fixed-window'; windowSec: number; maxRequests: number }
  | { algorithm: 'sliding-window-log'; windowSec: number; maxRequests: number };

export function createLimiter(config: LimiterConfig, now: number): RateLimiter {
  switch (config.algorithm) {
    case 'token-bucket':
      return new TokenBucket(config.capacity, config.refillRate, now);
    case 'leaky-bucket':
      return new LeakyBucket(config.capacity, config.leakRate, now);
    case 'fixed-window':
      return new FixedWindowCounter(config.windowSec * 1000, config.maxRequests, now);
    case 'sliding-window-log':
      return new SlidingWindowLog(config.windowSec * 1000, config.maxRequests);
  }
}
