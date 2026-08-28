/** Fixed infrastructure script, never supplied by a visitor. One atomic primary write. */
export const ROLLING_WINDOW_SCRIPT = `
local key = KEYS[1]
local maximum = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= maximum then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000))}
end
redis.call('ZADD', key, now, ARGV[3])
redis.call('PEXPIRE', key, window)
return {1, 0}
`;

export const WINDOW_MS = 600_000;
export const LIMITS = { discovery: 20, evaluation: 10 } as const;
export type ProtectedRoute = keyof typeof LIMITS;
