import type { AlgorithmId } from '../algorithms';

export interface AlgorithmInfo {
  name: string;
  tagline: string;
  summary: string;
  time: string;
  space: string;
  pros: string[];
  cons: string[];
  usage: string[];
}

export const ALGORITHM_ORDER: AlgorithmId[] = ['token-bucket', 'leaky-bucket', 'fixed-window', 'sliding-window-log'];

export const ALGORITHM_INFO: Record<AlgorithmId, AlgorithmInfo> = {
  'token-bucket': {
    name: 'Token Bucket',
    tagline: 'Bursty in, average-rate out',
    summary:
      'Tokens refill continuously up to a capacity. Each request spends one token; with no tokens left, the request is rejected. Refill is computed lazily from elapsed time, so no timer is needed.',
    time: 'O(1) per request',
    space: 'O(1) per client (tokens + last refill time)',
    pros: [
      'Allows short bursts up to the bucket capacity',
      'Tiny state, so it maps cleanly to one Redis hash and a Lua script',
      'Two intuitive knobs: burst size and sustained rate',
    ],
    cons: [
      'A full bucket lets a burst hit upstream all at once',
      'Distributed use needs atomic read-modify-write (Lua or CAS)',
    ],
    usage: ['AWS API Gateway throttling', 'Stripe API rate limits', 'Envoy local rate limit filter'],
  },
  'leaky-bucket': {
    name: 'Leaky Bucket',
    tagline: 'Smooth, constant outflow',
    summary:
      'Requests join a FIFO queue that drains at a fixed rate. When the queue is full, new requests are rejected. Upstream sees a perfectly smooth stream regardless of input burstiness.',
    time: 'O(1) per request',
    space: 'O(capacity) for the queue',
    pros: [
      'Strict, constant output rate protects fragile upstreams',
      'Absorbs bursts instead of rejecting them, while the queue has room',
    ],
    cons: [
      'Adds queueing latency (up to capacity / leak rate)',
      'A burst can fill the queue with old requests and starve new ones',
      'Needs a scheduler or worker to drain the queue',
    ],
    usage: ['NGINX limit_req (with burst)', 'Network traffic shaping (ATM / QoS)', 'Job and message queues'],
  },
  'fixed-window': {
    name: 'Fixed Window Counter',
    tagline: 'Cheapest counter, leaky edges',
    summary:
      'Time is cut into fixed windows aligned to the clock. A counter per window is incremented on each request and resets when the next window begins.',
    time: 'O(1) per request',
    space: 'O(1) per client (one counter)',
    pros: [
      'Simplest possible distributed implementation: Redis INCR + EXPIRE',
      'Very low memory, easy to explain to users ("100 per minute")',
    ],
    cons: [
      'Boundary burst problem: up to 2x the limit can pass around a window edge',
      'Clients that retry at reset create synchronized spikes',
    ],
    usage: ['GitHub API hourly quotas', 'Basic API key quotas', 'Login attempt counters'],
  },
  'sliding-window-log': {
    name: 'Sliding Window Log',
    tagline: 'Exact, at a memory cost',
    summary:
      'Stores a timestamp for every accepted request. On each request, timestamps older than the window are evicted; the request passes if fewer than the limit remain.',
    time: 'O(log n) per request with a sorted set',
    space: 'O(limit) timestamps per client',
    pros: [
      'Exact: the limit holds for every rolling window, with no boundary bursts',
      'Gives precise Retry-After values (oldest entry + window)',
    ],
    cons: [
      'Memory grows with the limit; expensive for high-volume clients',
      'More Redis work per request (ZREMRANGEBYSCORE, ZCARD, ZADD)',
    ],
    usage: ['Low-volume, high-value endpoints (payments, auth)', 'Redis sorted-set limiters', 'Abuse and fraud detection'],
  },
};
