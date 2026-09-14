import "server-only";

export class StoreConfigurationError extends Error {
  constructor(
    readonly code:
      | "cache_mode_invalid"
      | "durable_pair_missing"
      | "durable_url_invalid",
  ) {
    super("store_unavailable");
    this.name = "StoreConfigurationError";
  }
}

/** Server-only adapter configuration. Never include values in errors or responses. */
export function storeConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const mode = env.CACHE_MODE ?? "auto";
  if (!["auto", "durable", "memory", "redis"].includes(mode))
    throw new StoreConfigurationError("cache_mode_invalid");
  // A partially configured pair must not silently downgrade to a demo store.
  const upstash = Boolean(
    env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN,
  );
  const kv = Boolean(env.KV_REST_API_URL || env.KV_REST_API_TOKEN);
  const url = upstash ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL;
  const token = upstash ? env.UPSTASH_REDIS_REST_TOKEN : env.KV_REST_API_TOKEN;
  if (!upstash && !kv && !["durable", "redis"].includes(mode)) return null;
  if (!url || !token) throw new StoreConfigurationError("durable_pair_missing");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new StoreConfigurationError("durable_url_invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.endsWith(".upstash.io") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.port
  )
    throw new StoreConfigurationError("durable_url_invalid");
  // Configured production credentials always win over an accidental memory flag.
  return { url, token };
}
