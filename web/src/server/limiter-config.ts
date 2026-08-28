type Environment = Record<string, string | undefined>;

const NAMES = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RATE_LIMIT_SALT",
] as const;
export type LimiterConfig =
  | { mode: "local" }
  | { mode: "distributed"; url: string; token: string; salt: string };

/** Shared by startup validation and every request; never returns partial config. */
export function limiterConfig(env: Environment = process.env): LimiterConfig {
  const [url, token, salt] = NAMES.map((name) => env[name]);
  if (NAMES.some((name) => env[`NEXT_PUBLIC_${name}`] !== undefined))
    throw new Error("Unsafe public sandbox protection configuration.");
  if (
    NAMES.every((name) => env[name] === undefined) &&
    env.NODE_ENV === "development" &&
    !env.VERCEL &&
    !env.VERCEL_ENV
  )
    return { mode: "local" };
  if (!url || !token || !salt)
    throw new Error("Public sandbox protection is not configured.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Public sandbox protection configuration is invalid.");
  }
  if (
    parsed.protocol !== "https:" ||
    !/^[a-z0-9-]+\.upstash\.io$/.test(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/" ||
    !/^[A-Za-z0-9_+=/-]{20,4096}$/.test(token) ||
    !/^[a-fA-F0-9]{64}$/.test(salt) ||
    new Set(salt.toLowerCase()).size < 8
  )
    throw new Error("Public sandbox protection configuration is invalid.");
  return {
    mode: "distributed",
    url: parsed.origin,
    token,
    salt: salt.toLowerCase(),
  };
}

export function assertProductionLimiterConfig(env: Environment = process.env) {
  if (
    env.NODE_ENV !== "production" ||
    limiterConfig(env).mode !== "distributed"
  )
    throw new Error("Production requires distributed sandbox protection.");
}
