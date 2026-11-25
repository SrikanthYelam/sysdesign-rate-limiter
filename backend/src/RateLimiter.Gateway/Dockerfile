# Build context is the repo root, because the Lua script is embedded from /backend-reference.
FROM mcr.microsoft.com/dotnet/sdk:11.0 AS build
WORKDIR /repo
COPY backend/src/RateLimiter.Gateway/RateLimiter.Gateway.csproj backend/src/RateLimiter.Gateway/
RUN dotnet restore backend/src/RateLimiter.Gateway/RateLimiter.Gateway.csproj
COPY backend-reference/TokenBucket.lua backend-reference/
COPY backend/src/RateLimiter.Gateway/ backend/src/RateLimiter.Gateway/
RUN dotnet publish backend/src/RateLimiter.Gateway/RateLimiter.Gateway.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:11.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "RateLimiter.Gateway.dll"]
