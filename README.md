# SignalForge

**Routing intelligence for the agent economy.** SignalForge turns a human or agent objective into a transparent, budget-constrained capability route across specialized services.

[Public app](https://signalforge-rose-two.vercel.app/) · [Live agent network](https://signalforge-rose-two.vercel.app/network) · [Developer interface](https://signalforge-rose-two.vercel.app/developers)

## The product

A caller supplies an objective, budget and policy. SignalForge decomposes the goal, inspects heterogeneous supply metadata, compares service combinations, and returns an **ExecutionRouteContract** with dependencies, provider rationale, verification requirements, fallbacks and stop conditions.

This is not a chatbot that claims to do every task. It is a procurement/planning layer that explains which capabilities an agent would need, what does not fit, and where it must stop. A research brief is one **simulated output example**, not the core identity.

```text
Human operator or calling agent
  → objective + budget + policy
  → objective decomposition (optional Groq / deterministic fallback)
  → required capabilities + dependency graph
  → deterministic route competition ← public catalog observations
  → agent-ready execution contract
  → STOP: execution_not_enabled
       future external execution requires a separate authorization/review
```

## What works now

- Open Agent Objective Console, optional public context URL, budget presets/custom cap, four policies.
- Typed ObjectiveFrame: objective type, capability priorities/dependencies, hard constraints, verification standard, output contract and ambiguity.
- Pure TypeScript route competition under budget, latency, reliability, critical-capability and verification constraints. Partial routes are explicit, never disguised as success.
- Real read-only catalog observations from the **Official MCP Registry**, **APIs.guru**, **Models.dev**, and **LiteLLM's model-cost map**. Source freshness, observation times, catalog age, unit-qualified prices and access limits are visible. Model catalogs are not live inference providers.
- A premium editorial `/network` explorer; services and task opportunities remain different models. Current tasks are controlled fixtures only.
- Immutable-shaped, Zod-validated downloadable route contract, session-only archive, local contract-state simulation and a separate fictional research output.
- Versioned REST planning/catalog API, four real Streamable HTTP MCP tools, and an explicitly **A2A-style discovery-only** card.
- No task-service execution, marketplace writes, payments, wallets, account system, trading or persistent visitor data.

## Route competition

Quality component = fixture quality × reliability × capability fit. Best-value scoring combines quality (0.48), source-group diversity (0.27), coverage (0.20), modeled cost penalty (0.18) and latency penalty (0.07). Critical coverage outranks these soft scores.

Cheapest minimizes feasible cost; Fastest minimizes feasible duration; Most verified favors independent verification and diversity. DAG dependencies and the operator's hard cap cannot be relaxed by model output. Costs are summed in integer cents. Monitoring specifications model 30 daily calls/month; no scheduler runs.

Under $0.10, independent due diligence yields a partial route. At $0.25, a most-verified demo can include Proofline Verify. All prices/quality/reliability for runnable demo steps are authored fixtures, not vendor claims. Live observations are ranked for discovery fit but excluded from executable steps without a reviewed adapter and defensible pricing. Unknown/unstructured payouts never yield exact projected margin.

## Provenance and safety

| State | Meaning |
|---|---|
| live | Successful current observation of an allowlisted catalog—not a service execution test |
| cached_live | Prior successful observation with original timestamp |
| seeded_catalog | Static metadata, not a fresh observation; supported by the schema |
| simulated_demo | Authored service traits, task examples or fictional evidence |
| unavailable / error | No usable current observation; not replaced with fake live data |

All contracts carry `executionStatus: execution_not_enabled`, `servicesCalled:false`, `paymentsMade:false`, and actual service cost zero. Optional Groq inference is **separate** from task-service spend; the app does not claim it costs the operator nothing outside their configured quota.

Public metadata GETs never forward cookies, auth or request bodies, follow redirects or contact listed service URLs. Public context URLs are not fetched. No paid service or x402 execution is implemented. Coinbase Bazaar is **disabled** because current terms restrict third-party redistribution without authorization. No marketplace passed a current redistribution gate for this release.

[Source assessments](docs/live-sources.md) · [Security model](docs/security.md) · [API reference](docs/api.md) · [MCP / discoverability](docs/mcp.md)

## Why this is agent-native

The artifact is structured routing intelligence, not conversational prose: capability → provider → input/output contract → dependency order → verification → fallback → stop. A calling agent can inspect the same contract as an operator through REST or MCP. It is not authorization to execute, and SignalForge does not pretend a planned route has run.

Example contract excerpt (fields shortened):

```json
{
  "schemaVersion": "1.0",
  "status": "planned",
  "executionMode": "demo_simulation",
  "executionStatus": "execution_not_enabled",
  "budget": {"hardCapUsd": 0.25, "estimatedRouteCostUsd": 0.05, "actualCostUsd": 0, "currency": "USD"},
  "provenance": {"isSimulated": true, "servicesCalled": false, "paymentsMade": false}
}
```

Complete exports include ObjectiveFrame, ordered route, rejected alternatives, observed supply with freshness, verificationPolicy, unmetRequirements, monitoringSpec where relevant, stopConditions, and createdAt.

## Local setup

```bash
cd apps/signalforge
npm ci
npm run dev -- --port 3001
# http://127.0.0.1:3001
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm start -- --port 3001
```

Node >=22.13; production uses Node 24. Existing Python and legacy web tests remain offline/reference assets, not production dependencies. Test browser servers explicitly disable optional model/discovery calls; production builds require no secrets.

Optional `apps/signalforge/.env.local` settings are documented in [.env.example](apps/signalforge/.env.example). Never commit that file or inspect/share secret values.

- `GROQ_API_KEY`: server-only Goal Decomposition Agent, currently `openai/gpt-oss-20b` (checked against Groq docs 2026-08-30). Vercel AI SDK schema-constrained generation, bounded timeout, no retries/tools. The UI streams status events, not unvalidated model fragments: Groq's structured-output API does not support streaming. Final output must pass Zod and deterministic constraints. Failure/missing key → `local_demo_fallback`. It does not browse, invent facts, select providers or verify evidence.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_SALT` (32+ characters): configure together for shared cache and rate limits.
- `CACHE_MODE=auto|durable|memory`: auto uses configured Redis, otherwise a visibly non-durable demo fallback. Partial shared config fails closed. Legacy redis remains a durable alias.
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`: alternative Vercel KV-compatible names. Same server-only adapter; no NEXT_PUBLIC_ secrets.
- `DISCOVERY_MODE=live|offline`: live allows only approved catalog GETs; offline disables all discovery network calls.

## Demo Planning API and MCP

```bash
curl https://signalforge-rose-two.vercel.app/api/v1/routes/plan \
  -H 'Content-Type: application/json' \
  -d '{"objective":"Build a route to extract and validate structured company data from a website","contextUrl":"https://example.com","budgetUsd":0.25,"optimizationPolicy":"best_value","mode":"demo"}'

curl 'https://signalforge-rose-two.vercel.app/api/v1/catalog?capability=news_search&limit=10'
```

MCP Streamable HTTP: `https://signalforge-rose-two.vercel.app/api/mcp`. Client setup in [mcp.json](apps/signalforge/mcp.json). Tools: `signalforge_plan_route`, `signalforge_search_catalog`, `signalforge_get_listing`, `signalforge_evaluate_opportunity`. No action tools.

[Agent Card](https://signalforge-rose-two.vercel.app/.well-known/agent-card.json) is A2A-style metadata only: no A2A message/task transport is claimed. [OpenAPI](https://signalforge-rose-two.vercel.app/api/v1/openapi), [llms.txt](https://signalforge-rose-two.vercel.app/llms.txt), and robots metadata support discovery.

Planning 10/client/10min; catalog 60/client/10min. Shared Redis sliding windows when configured; otherwise fixed-window per-instance demo fallback—not distributed production protection. Hashes only, no raw IP logs. No unrestricted refresh endpoint. MCP/APIs.guru refresh hourly; Models.dev/LiteLLM every six hours. Stale-while-revalidate retains observations at most 24h. [Production store setup and privacy](docs/durable-network.md).

## Command surface and agent integration proof

The first viewport is an Agent Objective Command Surface with budget/policy
dropdowns, Cmd/Ctrl+Enter compilation and a local capability-chain preview.
Preview typing never calls a model; network counts come from observed snapshots.
GSAP scopes entry rails and capability transitions; mobile and reduced motion retain
static readable states. The routed-S favicon is original SVG.

`/network` searches bounded snapshots with URL-backed source, type, capability,
freshness, pricing, availability and actionability filters. Sorting never compares
token prices as exact per-task costs. “Use in route” carries discovery context,
not execution permission.

`/developers/try` sends real REST and Streamable HTTP MCP requests, validates the
returned contract, displays the exact JSON and fetches this deployment's Agent Card.
It works without Groq or Redis in explicitly labeled demo mode. Both model catalogs
are observed live, but all selected execution steps remain controlled fixtures.

## Vercel

Existing project: **signalforge**. Root Directory: `apps/signalforge`. Framework: Next.js. Install `npm ci`; build `npm run build`; output default; Node 24.

Production branch: `claude/verify-bounty-api-facts-f6ccdu`. Push triggers the existing Git integration. No separate Python server or filesystem database is needed.

Add optional server-only variables to Production/Preview in Vercel, then redeploy. For shared protection use an existing Upstash Redis store, its HTTPS REST URL/token and an independent 32+ character salt; never create a paid resource without operator approval. All three shared settings are required together. No NEXT_PUBLIC_ secrets. Without keys the app remains demoable, but memory quotas/cache are not appropriate for high-volume aggregation.

After deployment: confirm exact Git SHA and READY in the SignalForge project; inspect /network observation labels; test a demo plan, MCP initialize/tools/list, /developers, card and security headers. Do not confuse the archived `web` Vercel project with SignalForge.

## 90-second demonstration

1. **0–15s:** Enter a verified company-intelligence objective at /. Forge route. Show real Groq label if available, otherwise Local demo decomposition.
2. **15–35s:** Inspect critical capabilities and verification dependencies. Build execution route; compare provider choices, prices and rejected options.
3. **35–50s:** Simulate route (local contract state only). Inspect/download JSON, stop conditions and execution_not_enabled.
4. **50–70s:** Open /network. Separate current catalog observations, cached observations, stale definitions and controlled task examples.
5. **70–90s:** Show /developers and MCP tools. Open the separate simulated research brief to explain what a future authorized route could produce—not what SignalForge executed.

## Visual system retained

Newsreader / Geist / Geist Mono; warm graphite and ivory; editorial rules rather than dashboard cards. Signal Field, GSAP scoped entry/route/section choreography, pinned desktop narrative, living-evidence example, precise selectors and page transitions remain. Mobile uses staged content without pinning; reduced motion shows static final states. No external imagery, stock illustrations, chat transcript or false live telemetry.

## What changed from Agent Arbiter

The Python marketplace prototype remains for offline regression/reference. Its lessons—heterogeneous task models, human selection gates, settlement restrictions, deterministic scoring and audit discipline—informed this routing-intelligence product. Archived marketplace connectors are not imported into the deployed Next.js app. SignalForge observes supply and plans capability routes; it does not promise autonomous earnings.

## Future, not implemented

Reviewed live service adapters; provider performance history; richer source-specific normalization; external agent contract consumption; and, only after explicit authorization/terms/budget/security review, retries and execution. Any future x402 payment execution remains outside this release. No collection, wallet or transaction code is added.

Commercial hypotheses only: a paid route-intelligence API, premium verified planning, or monitoring intelligence. Validate demand for the contract and its decision rationale before implementing monetization.
