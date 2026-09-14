# Real-data v1 — Preview only

SignalForge is an arbitrage underwriter and routing intelligence layer for agent work. This increment extends feature baseline b9e62aad; it does not promote or rewrite production baseline c117f844. Git authorship uses a GitHub noreply identity; historical commits are unchanged.

Every shared key is isolated by trusted server runtime environment: `sf:<production|preview|development|test>:<purpose>:v3:...`. This covers catalog snapshots and validators, refresh/circuit state, rate counters, model-admission leases and FX observations. Conflicting or unknown hosted environments fail closed. Separate Preview and Production Upstash databases remain recommended defense in depth.

## Observed demand

Agent Bounties' documented ready_to_earn projection is read through a fixed JSON Feed and fixed REST query. The feed's ETag/Last-Modified gate the richer REST projection. A 304 reuses the prior observation, retaining its timestamp; stale data is never relabelled fresh. Once the observation reaches the 24-hour retention boundary, the connector omits validators and requires a complete feed/projection fetch, so unchanged validators cannot permanently hide inventory. Shared ten-minute leases prevent cold-start polling storms. Last-good data is retained up to 24 hours; three failures open a six-hour backoff. There is no public force refresh.

We validate the hosted projection, not a blockchain. Source-reported canonical_base, claimable, escrowed, payment_committed and verification_ready are necessary but insufficient. Missing/expired deadlines, closed scoring windows, standing funding competitions and unknown requirements block favorable underwriting. Cached reads recheck deadlines and scoring windows against the current time; malformed timestamps remain unknown. Capability mapping is complete only when every supplied skill has an exact supported identifier; a mixture of known and unknown skills keeps the scope unknown. The application never follows next_action, commands, returned URLs or evidence links.

## Money and uncertainty

USDC reward, refundable bond and external spend retain structured integer base units (six decimals). Bond is capital at risk, not a guaranteed fee. Known reward minus required spend is cash headroom, **not profit**. Bonuses and source-reported gross margin do not drive the decision.

Economic provenance: observed_source, published_provider_price, estimated_from_live_inputs, actual_usage, user_scenario, unknown. No universal success probability exists. Explicit probability input is a user assumption, not measured confidence. Legacy USD payout scenarios remain in the submitted-scenario audit field but do not replace an observed USDC reward or populate an exact USD payout. There are zero outcome observations.

The reviewed first-party Groq production-model snapshot (2026-09-14, expires 2026-10-14) prices `openai/gpt-oss-20b` at $0.075 input / $0.30 output per million tokens. The dedicated pricing module returns unknown after expiry; it never scrapes pricing pages at runtime. With explicit maximum input/output tokens and bounded calls, integer ceiling arithmetic yields a worst-case provider cost. It is a workload ceiling, not a task quote or observed spend.

USDC is never silently equated with USD. A fixed, public, read-only Coinbase `USDC-USD` spot endpoint supplies a short-lived market observation. Its decimal string is parsed to exact USD micros, cached under an environment namespace, and rejected when stale, malformed, redirected, oversized or non-JSON. An operator may explicitly supply a separate `user_scenario` FX rate. If neither is usable, cross-currency economics remain unknown.

Real Economics v1 requires explicit success probability, bounded workload, platform/proof fees, human review, additional fulfillment, time-value and competition-risk inputs. A nonzero refundable bond additionally needs an explicit loss probability. It computes conditional profit and margin, risk-adjusted EV, break-even reward, maximum fulfillment cost and required success probability using integer arithmetic. Bond principal is capital required, not guaranteed spend. Decisions are `CONDITIONALLY_PROFITABLE`, `CONDITIONALLY_MARGINAL`, `CONDITIONALLY_UNECONOMIC`, `UNROUTABLE`, `NOT_ELIGIBLE`, or `INSUFFICIENT_DATA`; conditional values are never called realized earnings.

ActualOutcomeSchema reserves provider request IDs, token usage, charges, external/proof/review costs, reward and realized margin. It is manual/import-only schema foundation: no public outcome-write endpoint or synthesized history exists. `ClaimReadinessPacket/1.0` is exposed through read-only REST and MCP inspection and always states `claimAuthorized=false`, `authorizationState=authorization_required`, and `executionStatus=execution_not_enabled`. Claims, execution, submission and settlement require a separate authorization milestone.

## Security

Marketplace text is bounded, Unicode/control-normalized plain data. Only exact source capability identifiers map to supported enums. There is **no marketplace-text LLM classifier**, no tools and no path from task content to network origins, model IDs, policy or budgets. Optional Groq interprets operator objectives in a separate server boundary; it does not underwrite tasks.

Connector origins and path/query families are fixed HTTPS constants. Only GET, redirect:error, credentials:omit and constructed Accept/conditional headers are available. No user URL, Authorization, cookie or body is forwarded. Payloads have source-specific byte caps, five-second fetch timeouts, bounded retries and Zod validation. Returned HTML is never rendered.

Public operations use shared ten-minute quotas: reads 60, underwriting 20, model-assisted planning 10. MCP tools consume the corresponding buckets. Four shared model-admission leases per twenty seconds bound expensive calls across instances. JSON bodies are at most 16 KiB with a five-second read timeout. Application URLs are capped at 2,048 characters and catalog queries at sixteen fields; duplicate decoded keys and unsupported fields are rejected. Status, listing, schema and JSON-body endpoints reject unused query controls. Result counts are bounded. Redis failure returns a generic 503, never unlimited access.

On Vercel, trusted platform x-vercel-forwarded-for is required; the platform must overwrite that header. Validated normalized addresses become salted HMAC keys. Raw IPs and visitor objective text are not intentionally persisted/logged. Local memory mode is for development only. Infrastructure/provider operational logs may still exist; see the localized Privacy page.

## Public versus fixtures

Normal runtime network, Radar, homepage and archive have no authored task/provider entries. ENABLE_DEMO_DATA=true explicitly enables historical fixtures only outside Vercel Production. Tests opt into them. Objective planning retains protocol compatibility but returns an incomplete planning_only contract when real catalog observations do not provide actionable task quotes; it never substitutes simulated providers.

All contracts retain execution_not_enabled, servicesCalled=false and paymentsMade=false. Observed catalog entries remain informational.

## Verification

Run npm run lint, npm run typecheck, npm test, npm run build, npm run test:e2e, npm run test:real-ui, npm audit and npm run verify:secrets from apps/signalforge. The opt-in npm run verify:runtime uses configured server credentials only through runtime loading and prints status, not values. CI uses no production secrets. Live checks are separate from CI to avoid upstream polling abuse.
