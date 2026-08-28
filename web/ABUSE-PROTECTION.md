# Public sandbox launch protection

## Contract

| Handler | Distributed limit | Window |
|---|---:|---|
| `GET /api/discovery` | 20 admitted attempts per client key | rolling 600 seconds |
| `POST /api/evaluate` | 10 admitted attempts per client key | rolling 600 seconds |

Admission runs first, before JSON parsing, normalization, policy evaluation, or
marketplace network requests. Malformed application input still consumes an
admission. Rejected attempts do not extend retention. Session IDs, cookie values,
deployment IDs, and instance memory are not part of the distributed key.

A single atomic Lua script on one Upstash Redis database removes expired events,
counts the remaining events, and conditionally inserts a random event ID with
Redis's server timestamp. Keys expire 600 seconds after the last admitted event.
The sorted set contains at most 20 or 10 events. All instances/deployments must
share the same database and salt for a given environment.

This uses `@upstash/redis` rather than `@upstash/ratelimit`'s built-in sliding
window helper because the latter is a two-window approximation. The exact event
log avoids boundary bursts. The script is fixed application infrastructure, not
visitor-provided executable code. See [Upstash algorithms](https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms)
and [Redis scripting atomicity](https://redis.io/docs/latest/develop/interact/programmability/eval-intro/).

## Failure behavior

- Limit exceeded: 429, `Cache-Control: no-store`, `Retry-After` in seconds, and
  “You’ve reached the public sandbox limit. Please try again shortly.”
- Missing/invalid configuration, malformed/untrusted client boundary, Redis
  errors/timeouts, redirects, oversized responses, or invalid decisions: 503,
  `Retry-After: 30`, and a generic temporary-unavailability message.
- Production build and start reject missing/unsafe configuration before serving.
- No failure allows discovery or evaluation to continue. There is no stale quota
  cache, fail-open timeout, or process-local production fallback.
- Redis uses a dedicated request transport with one fixed EVAL command, one
  2.5-second request, a 4KiB response limit, no retries, no redirects, no cookies,
  and no SDK analytics/telemetry. Uncertain outcomes may consume a slot; they
  never authorize application work.

The only new remote write is short-lived limiter metadata in the configured
Upstash store. This is not a marketplace endpoint or an application data store.
The two fixed marketplace routes still use GET, no request bodies, no auth or
cookies, no redirects, and no caller-selected URLs. Preview constants, worker
isolation, zero actual inference cost, and no approval/submission remain intact.

## Client-key privacy and ingress assumptions

Production admission trusts **only direct Vercel ingress** (`VERCEL=1`, a
platform-provided server variable). The code validates the entire bounded
`x-forwarded-for` chain (maximum eight addresses / 512 characters), then selects
the first address. IPv4/IPv6 are parsed strictly; whitespace is trimmed, IPv6
forms are canonicalized, and IPv4-mapped IPv6 becomes IPv4. Ports, hostnames,
zone IDs, empty entries, and invalid chains fail closed. If
`x-vercel-forwarded-for` is present, its normalized first address must agree.
Neither `x-real-ip` nor a caller's session header is used as a fallback identity.

Vercel overwrites forwarding headers to prevent ordinary client spoofing. Do not
place an unreviewed proxy/CDN in front, enable custom Trusted Proxy behavior, or
expose a direct non-Vercel origin and assume these semantics still hold. Additional
proxies may cause clients to share a quota or fail closed. See [Vercel request
headers](https://vercel.com/docs/headers/request-headers.rsc).

The normalized address is HMAC-SHA-256 hashed with a 32-byte secret salt and a
versioned purpose separator. Redis keys contain only the digest and route class;
values contain only random event IDs and timestamps. No raw IP, user agent,
cookie, session ID, profile/policy input, task content, ledger, or outcome is sent
to Redis. The app does not log IPs, hashes, requests, secrets, or SDK exceptions.

These hashes are **pseudonymous**, not anonymous: the same address correlates
within the retention window, and a salt holder could test candidate addresses.
Disable store backups/analytics and review provider access-log retention. TTL
removes active keys, not any provider-managed backups or access logs. This app
cannot guarantee the provider's infrastructure retention policy. Salt rotation
resets quota identity; coordinate rotation, preferably after a quiet window.
Shared NAT addresses share quotas; distributed attackers can rotate IPs. Edge
volumetric protection and quota/budget monitoring remain complementary controls.

## Exact Vercel configuration steps (manual; not performed)

1. Review the local commit and manually push the branch when ready. Use the
   existing project, branch `claude/verify-bounty-api-facts-f6ccdu`, root directory
   **`web`**, framework **Next.js**, Node **22.x** (22.13+) or a supported newer
   version, install **`pnpm install --frozen-lockfile`**, build **`pnpm build`**.
   Do not select the hermetic test harness as the deployment build command.
2. In Vercel Storage/Marketplace, choose **Upstash Redis**, or use an existing
   dedicated Upstash Redis database. Provisioning, login, billing, and plan
   acceptance are operator actions, not actions performed by this implementation.
   If creation requires a paid plan or credits, stop for explicit authorization.
3. Choose one database primary near the Vercel function region. Do not shard the
   same environment's limits across independent databases. Use primary atomic
   writes, disable eviction (quota loss must not silently admit traffic), disable
   backups/analytics for this dedicated short-lived store, and disable automatic
   paid upgrades. Review provider quota behavior and billing controls. If quota
   exhaustion returns errors, the app will safely return 503.
4. Obtain the database's HTTPS REST URL and a token permitted to run the fixed
   EVAL script (a read-only token is insufficient). Prefer a narrowly scoped
   credential restricted to the `arbiter:public:v1:*` namespace and required
   commands if your Upstash plan supports that. The script needs TIME,
   ZREMRANGEBYSCORE, ZCARD, ZRANGE, ZADD and PEXPIRE inside EVAL.
5. In Vercel Project Settings → Environment Variables, set these **server-only**
   variables for Production and Preview. Use separate databases and salts between
   environments, but identical values across instances within an environment:

   | Variable | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | Exact `https://<database>.upstash.io` origin; no custom path, query, port or user info |
   | `UPSTASH_REDIS_REST_TOKEN` | The corresponding Redis REST token |
   | `RATE_LIMIT_SALT` | 64 hex characters generated from 32 cryptographically random bytes |

   Generate the salt locally with `openssl rand -hex 32`, then copy it directly
   into the secret field. Never paste it into issues, chat, screenshots, logs, or
   committed files. Do not prefix any variable with `NEXT_PUBLIC_`. Do not add
   Groq, marketplace, wallet, worker, authentication, or payment variables. Vercel
   supplies `VERCEL`, `VERCEL_ENV` and `NODE_ENV`; do not override those to enable
   development behavior. Ensure Vercel's automatic system-environment exposure
   is enabled; missing trusted-ingress metadata fails closed. No additional
   application feature flag is needed.
6. Build/deploy only after operator approval. Environment changes require a new
   deployment. Missing/partial configuration should fail the build. Recheck
   every deployment target and branch override for the correct store/salt pair.

## Local development without a cloud account

Leave all three application variables **unset**, and run `pnpm dev:local`.
The command binds Next's development server to `127.0.0.1`; no LAN binding or
public tunnel is supported. Loopback URL/Host checks are an additional guard,
not a substitute for the loopback bind. Forwarded addresses are ignored locally;
all local requests share bounded per-route arrays with the same 20/10 limits.

The fallback requires `NODE_ENV=development`, no Vercel platform environment,
no limiter variables at all, and a loopback HTTP request. Partial credentials
never select fallback. On Vercel Preview/Production or under production build/
start, it cannot be enabled. `.env.example` contains intentionally invalid
placeholders; copying it unchanged must not make production usable.

`pnpm verify:build` runs a genuine production build with synthetic test-only
configuration. `pnpm test:e2e` launches that build with a hermetic harness on
loopback, without trusted Vercel ingress. Real protected API calls return 503;
successful UI paths are explicitly mocked. This is **not** a bypass and is not
proof of a real Upstash connection. The harness does not provision or contact a
cloud store. A production local preview with real configuration still refuses
untrusted non-Vercel ingress; use `dev:local` for interactive local discovery.

## Verification checklist

- Run Python tests, live GET tests, golden evaluation and the 184-case parity
  drift check; no Python engine or marketplace connector changes are required.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm verify:build`,
  `pnpm test:e2e`, and `pnpm audit` (including development dependencies).
- Confirm ordinary `pnpm build` and `pnpm start` refuse missing configuration.
- Unit tests execute the actual Lua script in an in-memory Redis emulator,
  including simultaneous clients, exact rolling boundaries and expiry. Real SDK
  tests intercept HTTP and verify the Redis request precedes credential-free
  marketplace GETs. No cloud resource or real credential is used in tests.
- Before launch, the operator must verify the real Preview store and direct
  Vercel ingress: the first 20 discovery / 10 evaluation attempts pass admission;
  attempt 21 / 11 returns 429. Use invalid application inputs for quota checks
  where possible (e.g. missing session/body): admitted requests then return 400,
  consuming quota without contacting a marketplace. Do not interpret that 400 as
  a limiter failure. Confirm cold starts and new browser sessions do not reset
  the same address's quota, and retry after the rolling window.
- Verify missing/invalid credentials or unavailable Redis produces generic 503
  and no marketplace traffic. Inspect only sanitized status/count telemetry.
- Inspect the dedicated store to confirm only HMAC-prefixed expiring event sets
  exist, with no IPs, policy data or opportunities. Do not capture secrets or
  client addresses in screenshots. Recheck provider logging/retention settings.

No provisioning, cloud-store call, deployment, or push is part of this milestone.
Real cloud connectivity and provider retention settings remain operator launch
gates, not verified claims.

## Local verification results — 28 August 2026

| Gate | Result |
|---|---|
| Python hermetic suite, including Streamlit tests | 305 passed |
| Live public GET tests | 3 passed |
| Golden corpus v1 | 40/40 decisions correct; routing/validation/reason agreement 100%; unsafe false-allows 0% |
| Python/TypeScript source check | Current; 184 parity cases |
| Web unit/integration tests | 253 passed in 7 files |
| Playwright desktop/mobile | 17 passed, including safe limit messages and real fail-closed handlers |
| ESLint / TypeScript / Ruff | Passed |
| Production build with hermetic synthetic configuration | Passed; no cloud store contacted |
| Missing-config production build / start | Both rejected, exit 1, as required |
| Explicit loopback development | Starts without keys; invalid discovery input returns 400 after local admission, with no marketplace request |
| Full dependency audit (including development dependencies) | No known vulnerabilities |

The Python suite retains an existing Starlette/httpx deprecation warning;
Playwright has a terminal color-environment warning. Neither is an application
failure. ESLint plugin resolution was made explicit for pnpm's isolated dependency
layout so production builds also run the lint gate successfully. The prior
portfolio screenshots and visual styles are unchanged; new browser captures go
to ignored `test-results/screenshots/`.
