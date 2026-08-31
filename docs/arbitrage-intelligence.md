# Arbitrage Intelligence / underwriter-1

This preview extends the existing SignalForge planner. It does not replace the ObjectiveFrame, ExecutionRouteContract, Groq fallback, public catalog transport, quota system or agent client. No task action, service execution or payment capability was added.

## Storage and boundaries

- Existing catalog snapshot/health/lease caches remain the only shared domain storage.
- Policies, scenarios, decisions and receipts are computed in memory. A receipt download writes only through the visitor's browser download.
- The server receipt is not persisted and its hash is an integrity fingerprint, **not a signature or authenticity guarantee**.
- No LLM is used by underwriting. Groq remains optional in the advanced Route Forge.
- Every evaluation and nested route keeps `execution_not_enabled`, no services called, no payments and zero actual task spend.
- The existing REST/MCP client-agent demo still consumes route contracts; it does not automatically accept or execute an arbitrage receipt.

## Modes and exact provenance

**Observed:** only actual `live` / `cached_live` tasks. No enabled task feed currently supplies these. Structured USD payouts may be normalized, but catalog unit prices alone cannot establish task costs, fees, failure exposure, acceptance probability or eligibility. These values stay null. Matching observed catalog options are context, not selected executable suppliers.

**Lab:** seven versioned authored tasks (spread, extraction, verification-expensive, unroutable, unknown payout, margin-sensitive, low-acceptance). All task prices and provider traits are simulated. Per-step service prices are explicit controlled assumptions, not current vendor quotes. Zero scenario fees/failure costs mean authored zero—not a claim about any platform.

**User scenario:** optional payout/probability overrides are labeled as such. An observed unknown cost remains unknown even after a payout override. There is no measured acceptance history.

## Integer economics

All input money is integer USD cents (0–1,000,000); route cost is capped at 1,000 cents to preserve the existing $10 demo planner limit. Probabilities and policy margins are integer basis points (0–10,000). Intermediate multiplication/division uses BigInt. Costs round up, receipts/revenue round down; negative margins round toward negative infinity. Missing inputs remain null.

Let P = payout, E = execution cost excluding verification, V = verification, T = platform fees, F = additional cost if failure occurs, p = success probability.

```text
failure reserve = ceil((1 − p) × F)
base cost       = E + V + T
expected cost   = base cost + failure reserve
expected profit = P − expected cost
expected margin = floor(10,000 × expected profit / P) [basis points]
capital at risk = base cost + F
risk-adjusted EV = floor(p × P) − expected cost
break-even payout = ceil(expected cost / p), when p > 0
required p        = minimum basis point for which rounded risk-adjusted EV ≥ 0
```

“Expected profit” is the requested **conditional spread** assuming the payout arrives, not realized earnings or risk-adjusted EV. Success probability is shown separately. A threshold above 10,000 bps means no attainable probability can break even.

The continuous required-probability lower bound is (base cost + F)/(P + F). The engine binary-searches integer basis points to satisfy the separately rounded revenue and failure reserve; it does not return a continuous threshold that still loses a cent after rounding.

Maximum allowable E+V is the nonnegative minimum of:

1. Maximum route-cost policy.
2. P − minimum profit − T − failure reserve.
3. floor(P × (1 − minimum margin)) − T − failure reserve.
4. Maximum capital − T − F.

Unknown probability with F=0 permits a conditional spread but not EV or probability-adjusted break-even. Unknown probability with F>0 makes the failure reserve and expected cost unknown. P=0 has no defined margin. Partial/unroutable routes never expose a profit, margin, risk EV or break-even claim, including their scenario bands.

The cost band perturbs **execution cost only** by −10% / base / +20%; it is a sensitivity scenario, not a confidence interval or measured distribution. Payout sensitivity holds the selected route fixed and recomputes decisions across payout assumptions. The main controls also re-run route competition.

## Route competition and decisions

Reuse `buildExecutionRoute` with bounded demo offers and critical opportunity capabilities. Compile cheapest, verification-oriented and fastest candidate assignments, remove duplicate provider sequences, then rank eligible decisions before applying the chosen economic optimization. This is a bounded comparison, not a claim of globally optimal real-market procurement.

- `profitable`: known conditional economics satisfy selected thresholds.
- `marginal`: positive/break-even route misses minimum profit or margin.
- `uneconomic`: negative spread, excess capital, probability below policy, or negative EV when risk-adjusted optimization is selected.
- `unroutable`: critical coverage or route constraints cannot be met.
- `insufficient_data`: missing economic inputs or disallowed provenance/freshness/confidence.

Highest reliability compares the **modeled minimum step reliability**, not measured task acceptance. When risk-adjusted optimization needs an unknown probability, return insufficient data rather than substituting a score.

## API / MCP compatibility

```http
GET /api/v1/opportunities?mode=observed&limit=20
GET /api/v1/opportunities?mode=lab&limit=20
POST /api/v1/opportunities/evaluate
```

```json
{
  "opportunityId": "lab:spread",
  "responseVersion": "2.0",
  "agentProfile": "default_demo_profile",
  "policy": {
    "minimumExpectedProfitCents": 20,
    "minimumMarginBps": 2500,
    "maximumCapitalAtRiskCents": 100,
    "maximumRouteCostCents": 100,
    "requireIndependentVerification": true,
    "optimization": "risk_adjusted"
  },
  "scenario": {"successProbabilityBps": 9200}
}
```

Response: `{evaluation, receiptHash, hashAlgorithm}`. Evaluation includes version, deterministicVersion, task provenance, mode, payout, economics, policy, scenario, risk, candidates with embedded contracts, selectedRouteId, missingInputs/reasons, capabilityCoverage, observed supply context, snapshotVersion/evaluatedAt and execution boundaries. The Zod schemas in `src/domain/arbitrage.ts` and OpenAPI are authoritative.

Requests without responseVersion retain the original response shape; do not silently reinterpret old clients. Unknown versions/fields, fractional cents, oversized payloads, duplicate query keys and alternate URLs fail validation before work. Existing catalog quota (60/client/rolling ten minutes), HMAC caller keys, same-origin restrictions and store-failure behavior remain in force. Responses are no-store.

MCP adds `signalforge_search_opportunities` and extends the existing safe `signalforge_evaluate_opportunity` with snake-case `response_version: "2.0"`; policy/scenario fields remain the canonical schema keys. The four existing tools continue working. No execution tool exists.

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"signalforge_evaluate_opportunity","arguments":{"opportunity_id":"lab:spread","response_version":"2.0","policy":{"minimumMarginBps":2500}}}}
```

The developer workbench now sends this REST evaluation and displays its MCP equivalent. API/MCP business logic shares the same pure engine.

## UI, performance and first paint

The new homepage/Radar use existing editorial tokens and procedural Signal Field. Motion owns route-result/decision transitions only. Existing GSAP pinned narrative retains its own DOM; no dual animation ownership. No chart/image/UI dependency was added. Source identities remain plain text/neutral marks: no unlicensed logo assets or implied partnerships.

Large seeded report objects no longer travel through global ResearchSession hydration. Only the explicit example-output page loads them; route archive seeds stay intact. Network first paint reads existing cache entries without upstream requests, leases or writes. Stale snapshots older than 24h are excluded. Protected client refresh retains clearly labeled prior content on failure. A failed durable cache is not falsely announced as a working memory fallback.

Human controls and new pages are localized in EN/ES/FR. Machine keys, codes, units and provider names remain stable. Raw external metadata is rendered as text, never HTML or instructions.

## Intentional gaps

No approved paid-task feed, authenticated eligibility, real task quote, acceptance dataset, fee agreement or execution authorization exists. Thus there are **zero defensibly underwritten observed paid tasks**. No earnings claim is made. Adding a feed requires the source gate; turning a receipt into an action requires a separately authorized design and security review.

Preview branch: `codex/agent-arbitrage-underwriter`. Never promote this branch or replace production without explicit approval.
