# Real-data v1 — Preview only

SignalForge is an arbitrage underwriter and routing intelligence layer for agent work. This increment extends feature baseline b9e62aad; it does not promote or rewrite production baseline c117f844. Git authorship uses a GitHub noreply identity; historical commits are unchanged.

Preview uses sf:catalog:v2 and sf:limit:v2 Redis namespaces. The older production v1 cache schema and caller quotas are not overwritten by this increment.

## Observed demand

Agent Bounties' documented ready_to_earn projection is read through a fixed JSON Feed and fixed REST query. The feed's ETag/Last-Modified gate the richer REST projection. A 304 reuses the prior observation, retaining its timestamp; stale data is never relabelled fresh. Shared ten-minute leases prevent cold-start polling storms. Last-good data is retained up to 24 hours; three failures open a six-hour backoff. There is no public force refresh.

We validate the hosted projection, not a blockchain. Source-reported canonical_base, claimable, escrowed, payment_committed and verification_ready are necessary but insufficient. Missing/expired deadlines, closed scoring windows, standing funding competitions and unknown requirements block favorable underwriting. The application never follows next_action, commands, returned URLs or evidence links.

## Money and uncertainty

USDC reward, refundable bond and external spend retain structured integer base units (six decimals). Bond is capital at risk, not a guaranteed fee. Known reward minus required spend is cash headroom, **not profit**. Bonuses and source-reported gross margin do not drive the decision.

Economic provenance: observed_source, published_provider_price, estimated_from_live_inputs, actual_usage, user_scenario, unknown. No universal success probability exists. Explicit probability input is a user assumption, not measured confidence. There are zero outcome observations.

The first-party Groq production-model snapshot (2026-08-31, expires 2026-09-30) prices openai/gpt-oss-20b at $0.075 input / $0.30 output per million tokens. With explicit maximum input/output tokens and bounded calls, integer ceiling arithmetic yields worstCaseProviderCost. It is a workload ceiling, not a task quote or observed spend. Unsupported requirements return null. USDC is not silently equated with USD. Missing fees, human effort, verification costs, FX and success probability keep expected profit null.

ActualOutcomeSchema reserves provider request IDs, token usage, charges, external/proof/review costs, reward and realized margin. It neither creates records nor enables the events it describes. Claims, execution, submission and settlement require a separate authorization milestone.

## Security

Marketplace text is bounded, Unicode/control-normalized plain data. Only exact source capability identifiers map to supported enums. There is **no marketplace-text LLM classifier**, no tools and no path from task content to network origins, model IDs, policy or budgets. Optional Groq interprets operator objectives in a separate server boundary; it does not underwrite tasks.

Connector origins and path/query families are fixed HTTPS constants. Only GET, redirect:error, credentials:omit and constructed Accept/conditional headers are available. No user URL, Authorization, cookie or body is forwarded. Payloads have source-specific byte caps, five-second fetch timeouts, bounded retries and Zod validation. Returned HTML is never rendered.

Public operations use shared ten-minute quotas: reads 60, underwriting 20, model-assisted planning 10. MCP tools consume the corresponding buckets. Four shared model-admission leases per twenty seconds bound expensive calls across instances. JSON bodies are at most 16 KiB with a five-second read timeout; query lengths, duplicate keys and result counts are bounded. Redis failure returns a generic 503, never unlimited access.

On Vercel, trusted platform x-vercel-forwarded-for is required; the platform must overwrite that header. Validated normalized addresses become salted HMAC keys. Raw IPs and visitor objective text are not intentionally persisted/logged. Local memory mode is for development only. Infrastructure/provider operational logs may still exist; see the localized Privacy page.

## Public versus fixtures

Normal runtime network, Radar, homepage and archive have no authored task/provider entries. ENABLE_DEMO_DATA=true explicitly enables historical fixtures only outside Vercel Production. Tests opt into them. Objective planning retains protocol compatibility but returns an incomplete planning_only contract when real catalog observations do not provide actionable task quotes; it never substitutes simulated providers.

All contracts retain execution_not_enabled, servicesCalled=false and paymentsMade=false. Observed catalog entries remain informational.

## Verification

Run npm run lint, npm run typecheck, npm test, npm run build, npm run test:e2e, npm run test:real-ui, npm audit and npm run verify:secrets from apps/signalforge. The opt-in npm run verify:runtime uses configured server credentials only through runtime loading and prints status, not values. CI uses no production secrets. Live checks are separate from CI to avoid upstream polling abuse.
