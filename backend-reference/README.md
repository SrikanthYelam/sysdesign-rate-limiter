# Phase 2: Distributed Backend (.NET 11 + Redis)

Phase 1 runs every algorithm inside the browser. Phase 2 moves the decision to
a real gateway so that **many gateway instances share one limit**. The UI does
not change: it switches from `ClientSimulationProvider` to `RemoteApiProvider`
(see `src/engine/`), which already speaks the REST contract below.

## Target architecture

```
 Browser (simulator UI)
   │  POST /api/rate-limit/evaluate        ▲  SignalR: limiter state (optional)
   ▼                                       │
 Load balancer
   │            │            │
 Gateway #1   Gateway #2   Gateway #3     ASP.NET Core 11 Web API
   │  custom RateLimitingMiddleware (one EVALSHA per request)
   └────────────┼────────────┘
                ▼
              Redis   ← single source of truth, atomic Lua scripts
```

## Why Redis + Lua

A naive distributed limiter does `GET` → compute → `SET` from the gateway.
Two instances can read the same value at the same time and both allow a
request, so the limit leaks under load. Redis executes a Lua script
atomically, so the whole read-modify-write runs as one step with no
interleaving, and it costs one network round trip.

| Algorithm | Redis data structure | Script operations |
|---|---|---|
| Token Bucket | Hash `{tokens, ts}` | `HMGET` → refill → `HSET` + `PEXPIRE` (see `TokenBucket.lua`) |
| Leaky Bucket (meter) | Hash `{level, ts}` | same shape as token bucket, inverted |
| Fixed Window | String counter per window key `rl:fw:{id}:{floor(now/window)}` | `INCR` + `PEXPIRE` on first hit |
| Sliding Window Log | Sorted set (score = timestamp) | `ZREMRANGEBYSCORE` → `ZCARD` → `ZADD` + `PEXPIRE` |

Notes:

- Use `TIME` inside the script instead of passing the clock from the gateway,
  so clock skew between instances does not matter.
- Wrap the client id in a hash tag (`rl:tb:{client-42}`) so Redis Cluster keeps
  all of a client's keys on one slot.
- A queueing Leaky Bucket (the one shown in the simulator) needs a worker to
  drain the queue. In a gateway it is usually modeled as a *meter* instead: the
  script computes when the request may proceed and the middleware either delays
  it (`Task.Delay`) up to a max wait or returns 429.

## Implementation plan

1. **Project**: `dotnet new webapi -n RateLimiter.Gateway` (.NET 11). Add
   `StackExchange.Redis`.
2. **Configuration**: bind a `RateLimiterOptions` record that mirrors the
   front-end `LimiterConfig` union (`algorithm`, plus that algorithm's
   parameters). Store the active config in Redis (`rl:config`) so every
   instance picks up changes from `PUT /api/rate-limit/config`.
3. **Scripts**: load each `.lua` file at startup with `LuaScript.Prepare(...)`
   and `.LoadAsync(server)`, then call `EVALSHA` per request.
   StackExchange.Redis falls back to `EVAL` automatically after `NOSCRIPT`
   (for example, after a Redis restart).
4. **Abstraction**: `IRateLimitAlgorithm { Task<RateLimitResult> EvaluateAsync(string clientKey, CancellationToken ct); }`
   with one implementation per script. This is the server-side twin of
   `src/algorithms/`.
5. **Middleware**: a custom `RateLimitingMiddleware` (rather than the built-in
   `Microsoft.AspNetCore.RateLimiting`, whose limiters are in-process only):
   - resolve the client key (API key header, then authenticated user, then IP),
   - call the active algorithm,
   - on allow, set `X-RateLimit-Remaining` and call `next()`,
   - on reject, return `429` with `Retry-After` and `X-RateLimit-Limit`.
6. **Endpoints** used by `RemoteApiProvider`:
   - `PUT  /api/rate-limit/config` sets the active algorithm and parameters
   - `POST /api/rate-limit/evaluate` with body `{ requestId, clientId }` returns `200 { remaining }` or `429`
7. **Live state (optional)**: a SignalR hub `/hubs/limiter-state` that pushes
   the current Redis state (tokens, queue level, window count) every 100 ms,
   so the simulator can keep drawing the bucket while running remotely.
8. **Failure policy**: decide fail-open or fail-closed when Redis is
   unreachable. Wrap the Redis call in a short timeout plus a circuit breaker
   (Polly). Fail-open with a local in-memory fallback limiter is the common
   choice for public APIs.
9. **Testing**: Testcontainers for Redis; fire N concurrent requests across 3
   in-process gateway instances and assert that exactly `capacity` are allowed.
   This test proves the Lua scripts remove the race condition.
10. **Run locally**: `docker compose up` with `redis:7` plus 3 gateway replicas
    behind an NGINX round-robin upstream.

## Middleware sketch

```csharp
public sealed class RateLimitingMiddleware(RequestDelegate next, IRateLimitAlgorithm limiter)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        var clientKey = ctx.Request.Headers["X-Api-Key"].FirstOrDefault()
                        ?? ctx.Connection.RemoteIpAddress?.ToString()
                        ?? "anonymous";

        var result = await limiter.EvaluateAsync(clientKey, ctx.RequestAborted);
        ctx.Response.Headers["X-RateLimit-Remaining"] = result.Remaining.ToString();

        if (!result.Allowed)
        {
            ctx.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            ctx.Response.Headers.RetryAfter =
                Math.Ceiling(result.RetryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
            return;
        }
        await next(ctx);
    }
}

public sealed class RedisTokenBucket(IConnectionMultiplexer redis, LoadedLuaScript script, TokenBucketOptions opt)
    : IRateLimitAlgorithm
{
    public async Task<RateLimitResult> EvaluateAsync(string clientKey, CancellationToken ct)
    {
        var r = (RedisResult[])(await redis.GetDatabase().ScriptEvaluateAsync(
            script,
            new { key = (RedisKey)$"rl:tb:{{{clientKey}}}", capacity = opt.Capacity, rate = opt.RefillRate, requested = 1 }))!;
        return new RateLimitResult((int)r[0] == 1, (int)r[1], TimeSpan.FromMilliseconds((long)r[2]));
    }
}
```

Note: `LuaScript.Prepare` uses named `@parameters`. To run `TokenBucket.lua`
as-is, either call `ScriptEvaluateAsync(sha, keys, values)` with
`KEYS`/`ARGV`, or replace `KEYS[1]`/`ARGV[n]` with `@key`, `@capacity`,
`@rate` and `@requested`.
