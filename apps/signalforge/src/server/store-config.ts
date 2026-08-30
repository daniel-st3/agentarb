import "server-only";

/** Server-only adapter configuration. Never include values in errors or responses. */
export function storeConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const mode = env.CACHE_MODE ?? "auto";
  if (!["auto", "durable", "memory", "redis"].includes(mode))
    throw new Error("store_unavailable");
  // A partially configured pair must not silently downgrade to a demo store.
  const upstash = Boolean(
    env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_TOKEN,
  );
  const kv = Boolean(env.KV_REST_API_URL || env.KV_REST_API_TOKEN);
  const url = upstash ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL;
  const token = upstash ? env.UPSTASH_REDIS_REST_TOKEN : env.KV_REST_API_TOKEN;
  if (!upstash && !kv && !["durable", "redis"].includes(mode)) return null;
  if (!url || !token) throw new Error("store_unavailable");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("store_unavailable");
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
    throw new Error("store_unavailable");
  // Configured production credentials always win over an accidental memory flag.
  return { url, token };
}
