# Durable network snapshots and quotas

The Next.js application uses the existing Upstash REST SDK, not filesystem storage.
No accounts or storage resources are provisioned by application code.

## Operator setup (Vercel signalforge only)

1. Connect an existing Upstash Redis database to the **signalforge** project through
   Vercel Marketplace / Storage. If creating a new store, review the provider's
   terms, quota and costs yourself; this implementation does not purchase resources.
2. Configure either the paired `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
   Supported HTTPS REST hosts end in `.upstash.io`; credentials in URLs, ports,
   query strings and alternate hosts are rejected. Upstash names take precedence;
   a partial Upstash pair does not silently use KV.
3. Add a separate random `RATE_LIMIT_SALT` of at least 32 characters. Use different
   stores/salts for Preview and Production. Never add a NEXT_PUBLIC_ prefix.
4. Set `CACHE_MODE=durable` in Production, then redeploy the current production
   branch. Do not modify the separate legacy web Vercel project.
5. GET `/api/v1/network/status`: verify `cacheMode: shared`,
   `rateLimitMode: distributed`, and timestamped source health. Repeat a catalog
   request and check cached_live retains the original observation time.
6. Use a controlled client to verify the 11th planning call or 61st catalog request
   within ten minutes returns 429 with Retry-After. Do not use real private objectives.
   Store failure or invalid configuration returns a generic 503, never a bypass.

Vercel Marketplace guide: https://vercel.com/docs/storage
Upstash rate limiting: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview

## Mode semantics

- `auto`: use shared storage when configured; otherwise explicitly labeled
  non_durable_demo memory, for low-volume demonstration only.
- `durable`: absence, partial configuration, errors or an invalid decision fail closed.
- `memory`: local/demo fallback without credentials. Existing configured shared
  credentials take precedence, so a mistaken flag cannot bypass distributed quotas.
- Legacy `redis` remains an alias for durable for existing deployments.

No shared credentials are required to build or demonstrate the app. Missing optional
Groq uses Local demo decomposition. Missing shared storage is **not** distributed
production protection and is reported as such. A live store must be configured by
the operator to finish the production-infrastructure rollout.

## Storage, refresh and privacy

Only normalized catalog snapshots, observation times, connector health/failure
counts, refresh leases and quota counters are stored. Snapshot retention: 48 hours;
last-good data is usable for at most 24 hours. Source TTLs: MCP/APIs.guru one hour,
Models.dev/LiteLLM six hours. Next.js after() supports stale-while-revalidate without
detaching a promise that serverless could discard; atomic Redis leases prevent
concurrent refreshes. Three failures pause a source for six hours.

Planning quota: 10 / client / rolling ten minutes. Catalog/MCP protocol: 60 / client /
rolling ten minutes. MCP planning consumes both. Hash keys use HMAC-SHA256 with the
server salt, never raw IPs. Expiring SDK quota counters have analytics disabled.
No objectives, policies, route contracts, visitor accounts or request bodies persist.

The deployment assumes Vercel's ingress overwrites trusted forwarding headers.
`x-vercel-forwarded-for` is preferred, otherwise the first validated IP in
`x-forwarded-for`; IPv6 is normalized. Malformed/oversized headers fail safely and
missing addresses share one conservative bucket. These headers are not trustworthy
on arbitrary self-hosted proxies: strip/overwrite them at ingress. Do not use a
visitor-selected session ID for security. Platform HTTP logs have their own
retention policy; this application never logs raw client addresses.

HTTP API responses use no-store deliberately: CDN caching must not bypass request
quotas or carry an old freshness label. Snapshot caching happens behind the limiter.
Only aggregate store mode and health appear in network status, never configuration.
