using StackExchange.Redis;

namespace RateLimiter.Gateway;

public sealed record TokenBucketConfig(int Capacity, double RefillRate);

public sealed record RateLimitResult(bool Allowed, long Remaining, long RetryAfterMs);

/// <summary>
/// Token bucket whose state lives in Redis, so every gateway instance shares
/// one limit. The read-refill-spend-write cycle runs as a single Lua script,
/// which Redis executes atomically: two instances can never both spend the
/// last token.
/// </summary>
public sealed class RedisTokenBucket(IConnectionMultiplexer redis, IConfiguration configuration)
{
    /// <summary>Active config is stored in Redis so a change reaches every instance.</summary>
    private const string ConfigKey = "rl:config";

    private static readonly string Script = LoadScript();

    private readonly TokenBucketConfig _defaults = new(
        configuration.GetValue("RateLimit:Capacity", 10),
        configuration.GetValue("RateLimit:RefillRate", 5.0));

    public Task SetConfigAsync(TokenBucketConfig config) =>
        redis.GetDatabase().HashSetAsync(ConfigKey,
        [
            new HashEntry("capacity", config.Capacity),
            new HashEntry("refillRate", config.RefillRate),
        ]);

    public async Task<RateLimitResult> EvaluateAsync(string clientId)
    {
        var db = redis.GetDatabase();
        var config = await GetConfigAsync(db);

        // The {hash tag} keeps all of a client's keys on one Redis Cluster slot.
        // StackExchange.Redis sends EVALSHA after the first call and resends
        // the script automatically if Redis replies NOSCRIPT.
        var result = (RedisResult[])(await db.ScriptEvaluateAsync(
            Script,
            [(RedisKey)$"rl:tb:{{{clientId}}}"],
            [config.Capacity, config.RefillRate, 1]))!;

        return new RateLimitResult((int)result[0] == 1, (long)result[1], (long)result[2]);
    }

    private async Task<TokenBucketConfig> GetConfigAsync(IDatabase db)
    {
        var values = await db.HashGetAsync(ConfigKey, ["capacity", "refillRate"]);
        return values[0].IsNull || values[1].IsNull
            ? _defaults
            : new TokenBucketConfig((int)values[0], (double)values[1]);
    }

    private static string LoadScript()
    {
        // Embedded from /backend-reference/TokenBucket.lua (see the .csproj).
        using var stream = typeof(RedisTokenBucket).Assembly.GetManifestResourceStream("TokenBucket.lua")!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
