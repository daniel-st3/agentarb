const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 30_000;

export function checkRefreshCooldown(sessionId: string, now = Date.now()) {
  for (const [key, timestamp] of cooldowns) {
    if (now - timestamp > COOLDOWN_MS * 2) cooldowns.delete(key);
  }
  const previous = cooldowns.get(sessionId);
  if (previous !== undefined && now - previous < COOLDOWN_MS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((COOLDOWN_MS - (now - previous)) / 1000),
    };
  }
  if (!cooldowns.has(sessionId) && cooldowns.size >= 5000) {
    return { allowed: false, retryAfterSeconds: 30 };
  }
  cooldowns.set(sessionId, now);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearRateLimitsForTests() {
  cooldowns.clear();
}
