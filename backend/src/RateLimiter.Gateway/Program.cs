using System.Globalization;
using RateLimiter.Gateway;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
{
    var options = ConfigurationOptions.Parse(
        sp.GetRequiredService<IConfiguration>()["Redis:ConnectionString"] ?? "localhost:6379");
    options.AbortOnConnectFail = false; // keep retrying if Redis starts after the gateway
    return ConnectionMultiplexer.Connect(options);
});
builder.Services.AddSingleton<RedisTokenBucket>();

var app = builder.Build();

// Connect at startup, not on the first request: otherwise a burst arriving at a
// fresh instance blocks thread-pool threads on the connect and Redis calls time out.
app.Services.GetRequiredService<IConnectionMultiplexer>();

// Tells you which replica answered, so load balancing across instances is visible.
var instanceId = Guid.NewGuid().ToString("N")[..8];
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Instance"] = instanceId;
    await next();
});

app.MapPut("/api/rate-limit/config", async (LimiterConfigRequest request, RedisTokenBucket limiter) =>
{
    if (request.Algorithm != "token-bucket")
        return Results.BadRequest(new { error = "Only 'token-bucket' is implemented in the backend so far." });
    if (request.Capacity is not > 0 || request.RefillRate is not > 0)
        return Results.BadRequest(new { error = "capacity and refillRate must be greater than 0." });

    await limiter.SetConfigAsync(new TokenBucketConfig(request.Capacity.Value, request.RefillRate.Value));
    return Results.NoContent();
});

app.MapPost("/api/rate-limit/evaluate", async (EvaluateRequest request, RedisTokenBucket limiter, HttpResponse response) =>
{
    var result = await limiter.EvaluateAsync(string.IsNullOrEmpty(request.ClientId) ? "anonymous" : request.ClientId);
    if (result.Allowed)
        return Results.Ok(new { remaining = result.Remaining });

    response.Headers.RetryAfter = Math.Ceiling(result.RetryAfterMs / 1000.0).ToString(CultureInfo.InvariantCulture);
    return Results.StatusCode(StatusCodes.Status429TooManyRequests);
});

app.Run();

/// <summary>Same shape as the front end's LimiterConfig; only token-bucket fields are used so far.</summary>
public sealed record LimiterConfigRequest(string Algorithm, int? Capacity, double? RefillRate);

public sealed record EvaluateRequest(string? RequestId, string? ClientId);

public partial class Program; // exposes Program to WebApplicationFactory in the tests
