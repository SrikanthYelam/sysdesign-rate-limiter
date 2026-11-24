import type { LimiterConfig } from '../algorithms';
import type { IRateLimiterProvider, ProviderSnapshot, RateLimitDecision } from './IRateLimiterProvider';

/**
 * Phase 2 provider (STUB): forwards every decision to a real gateway, e.g. the
 * ASP.NET Core + Redis service described in /backend-reference/README.md.
 *
 * Expected REST contract:
 *   PUT  {baseUrl}/api/rate-limit/config     body: LimiterConfig
 *   POST {baseUrl}/api/rate-limit/evaluate   body: { requestId, clientId }
 *        -> 200 { remaining }                 request allowed
 *        -> 429 + Retry-After header          request throttled
 *
 * For live internal-state visualization, the backend can push limiter state
 * over SignalR (hub: /hubs/limiter-state); `getSnapshot` would then return the
 * latest pushed state instead of null. Not wired up yet.
 */
export class RemoteApiProvider implements IRateLimiterProvider {
  readonly kind = 'remote' as const;
  private readonly origin = performance.now();

  constructor(
    private readonly baseUrl: string,
    private readonly clientId = 'simulator',
  ) {}

  async configure(config: LimiterConfig): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/rate-limit/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`Failed to configure remote limiter: HTTP ${res.status}`);
  }

  async evaluateRequest(requestId: string): Promise<RateLimitDecision> {
    const res = await fetch(`${this.baseUrl}/api/rate-limit/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, clientId: this.clientId }),
    });
    const decidedAt = performance.now() - this.origin;

    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get('Retry-After'));
      return {
        requestId,
        allowed: false,
        statusCode: 429,
        retryAfterMs: Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : undefined,
        decidedAt,
      };
    }
    if (!res.ok) throw new Error(`Remote limiter error: HTTP ${res.status}`);

    const body = (await res.json()) as { remaining?: number };
    return { requestId, allowed: true, statusCode: 200, remaining: body.remaining, decidedAt };
  }

  getSnapshot(): ProviderSnapshot | null {
    return null; // TODO(Phase 2): return latest state pushed over SignalR.
  }

  dispose(): void {
    // TODO(Phase 2): stop the SignalR connection.
  }
}
