using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.Redis;

namespace RateLimiter.Gateway.Tests;

/// <summary>
/// Three gateway instances share one real Redis (started in Docker by
/// Testcontainers). Fires a concurrent burst across all three and checks that
/// the combined number of 200s never exceeds the bucket capacity.
/// </summary>
public sealed class DistributedTokenBucketTests : IAsyncLifetime
{
    private const int Instances = 3;
    private const int Capacity = 10;
    private const int Requests = 100;

    private readonly RedisContainer _redis = new RedisBuilder("redis:7.4").Build();
    private readonly List<WebApplicationFactory<Program>> _gateways = [];

    public async Task InitializeAsync()
    {
        await _redis.StartAsync();
        for (var i = 0; i < Instances; i++)
        {
            _gateways.Add(new WebApplicationFactory<Program>().WithWebHostBuilder(host =>
                host.UseSetting("Redis:ConnectionString", _redis.GetConnectionString())));
        }
    }

    public async Task DisposeAsync()
    {
        foreach (var gateway in _gateways) await gateway.DisposeAsync();
        await _redis.DisposeAsync();
    }

    [Fact]
    public async Task Limit_holds_across_gateway_instances_under_concurrent_load()
    {
        var clients = _gateways.Select(g => g.CreateClient()).ToArray();

        // Near-zero refill so no token comes back during the test: exactly
        // `Capacity` requests may pass, however the burst is interleaved.
        var configure = await clients[0].PutAsJsonAsync("/api/rate-limit/config",
            new { algorithm = "token-bucket", capacity = Capacity, refillRate = 0.001 });
        configure.EnsureSuccessStatusCode();

        // Hold every request at a gate, then release them all at once.
        var gate = new TaskCompletionSource();
        var calls = Enumerable.Range(0, Requests).Select(async i =>
        {
            await gate.Task;
            var response = await clients[i % Instances].PostAsJsonAsync("/api/rate-limit/evaluate",
                new { requestId = $"req-{i}", clientId = "load-test" });
            return (response.StatusCode,
                    Instance: response.Headers.GetValues("X-Instance").Single(),
                    RetryAfter: response.Headers.RetryAfter);
        }).ToArray();
        gate.SetResult();
        var results = await Task.WhenAll(calls);

        Assert.Equal(Capacity, results.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(Requests - Capacity, results.Count(r => r.StatusCode == HttpStatusCode.TooManyRequests));
        Assert.Equal(Instances, results.Select(r => r.Instance).Distinct().Count());
        Assert.All(results.Where(r => r.StatusCode == HttpStatusCode.TooManyRequests),
            r => Assert.NotNull(r.RetryAfter));
    }
}
