# Security and execution boundary

SignalForge performs public metadata discovery and route planning only. No marketplace write, bid, claim, acceptance, submission, cancellation, settlement, login, account creation, messaging, wallet, private key, signing, transfer, trading, paid task-service call, browser scraping or autonomous execution path is added.

## Outbound isolation

- Two literal catalog destinations in `server/intelligence/transport.ts`; connector callers pass an enum, never a URL. GET only, constant Accept header, no auth/cookies/body, redirects rejected, 5s abort, 1 MB streamed response bound, one bounded transient retry.
- Descriptive listing URLs are returned for human inspection but never fetched by SignalForge. Context URLs are not fetched.
- Groq is a separate optional server-only decomposition adapter. Its sole fixed POST endpoint receives the operator objective/context and a constrained schema prompt, not upstream catalog descriptions. It has no tools, no provider selection authority, no retries, and a 12s abort. Invalid output or provider failure falls back locally. No raw reasoning/source claims are streamed.
- `GROQ_API_KEY` is consumed only in server code. Never `NEXT_PUBLIC_`. Build checks inspect client chunk source for server boundary identifiers; no tool reads actual secret values. No prompts or vendor errors logged.

## Shared infrastructure and privacy

`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_SALT` (at least 32 characters) are server-only. Supported URL must be HTTPS on `.upstash.io` with no credentials/path. Partial/invalid configured store fails closed, never silently falls back. Redis requests have bounded timeout/retries disabled.

`CACHE_MODE=auto` uses configured Upstash, otherwise a non-durable demo memory cache. `memory` does not override configured Redis. `redis` requires shared configuration. No database migration, disk persistence or user-secret storage.

Shared rate limits use Upstash sliding windows: planning 10/10min; catalog 60/10min. The fallback is conservative fixed-window per process, maximum 2,048 hashed buckets, not production-wide enforcement. No claim that it defeats distributed attackers. It is visibly documented in Network/API pages. Unknown client address shares one bucket; invalid headers fail safely.

On Vercel, trust platform-normalized `x-vercel-forwarded-for`, falling back to the first validated `x-forwarded-for` address. IPv6 representations are normalized. HMAC SHA-256 with a server salt precedes rate-limit storage. Memory mode uses an ephemeral random salt; Redis uses the configured stable salt. No raw IP logging, policy-input persistence, request-body analytics, or visitor identity database. Hosting/upstream infrastructure may retain their own access logs. Behind another proxy, strip client-supplied forwarding headers before setting trusted ones; do not expose the origin directly.

Redis contains only expiring hashed quota counters, normalized public catalog snapshots and source refresh leases. Snapshot TTL 48h, display maximum age 24h. Model outputs/visitor routes are React session memory only and reset on reload. Downloaded route contracts contain the objective; users are warned to review before sharing.

## Validation and disclosure

- Strict Zod requests and normalized records, bounded query lengths and sample sizes, no passthrough URLs/keys/code/payment instructions. DAG must be acyclic and all dependencies present. Operator budget/policy and deterministic critical needs cannot be relaxed by the model.
- No exact margin is calculated from unstructured payout or missing execution estimates. Current tasks are simulated and have insufficient cost/success evidence, so margin is unavailable.
- React escapes provider descriptions. No upstream HTML is injected; no external images/scripts/fonts or listed tool installations.
- Same-origin browser policy, no wildcard CORS, nosniff, no-referrer, disabled camera/microphone/geolocation, DENY framing. CSP restricts connect-src to self and blocks objects/framing. Inline script/style allowance is retained for Next static hydration/GSAP; no unsafe-eval or remote script allowance. A nonce CSP is a future hardening option, not claimed here.
- All route contracts explicitly state `execution_not_enabled`, `servicesCalled:false`, `paymentsMade:false`, actual service cost zero. A simulated state is local contract inspection, not evidence of provider invocation.

## Future production review

Before high traffic: configure shared quotas/cache, validate Vercel forwarding-header assumptions on the chosen hosting path, establish source-specific capacity and legal monitoring, and add managed firewall/observability without request-body capture. Any future live execution requires separate provider terms, authentication, explicit user authorization, hard budgets including retries, and security review. It is not part of this release.
