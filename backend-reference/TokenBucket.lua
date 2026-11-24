--[[
  Atomic Token Bucket for Redis.

  Redis runs a Lua script as a single atomic operation, so the
  read -> refill -> spend -> write cycle cannot interleave with another
  gateway instance working on the same key. That removes the race condition
  where two instances both read "1 token left" and both allow a request.

  KEYS[1]  bucket key, e.g. "rl:tb:{client-id}" (hash with fields `tokens`, `ts`)
  ARGV[1]  capacity        (max tokens, integer)
  ARGV[2]  refill_rate     (tokens per second, may be fractional)
  ARGV[3]  requested       (tokens to spend, usually 1)

  Returns: { allowed (1|0), remaining_tokens (floored), retry_after_ms }

  Time comes from Redis itself (TIME) rather than from the caller, so clock
  skew between gateway instances does not matter. Calling TIME before a write
  is allowed since Redis 5 (scripts are replicated by effects, not verbatim).
]]

local key         = KEYS[1]
local capacity    = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local requested   = tonumber(ARGV[3])

local t      = redis.call('TIME')
local now_ms = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

-- Load state; a missing key means a brand new, full bucket.
local state  = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1])
local last   = tonumber(state[2])
if tokens == nil then
  tokens = capacity
  last   = now_ms
end

-- Lazy refill based on elapsed time.
local elapsed = math.max(0, now_ms - last)
tokens = math.min(capacity, tokens + (elapsed / 1000) * refill_rate)

local allowed        = 0
local retry_after_ms = 0
if tokens >= requested then
  tokens  = tokens - requested
  allowed = 1
else
  retry_after_ms = math.ceil(((requested - tokens) / refill_rate) * 1000)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', now_ms)

-- Expire idle buckets once they would be full again anyway.
local ttl_ms = math.ceil((capacity / refill_rate) * 1000) + 1000
redis.call('PEXPIRE', key, ttl_ms)

return { allowed, math.floor(tokens), retry_after_ms }
