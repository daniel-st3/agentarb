# SignalForge v1 discovery and demo planning API

Base: `https://signalforge-rose-two.vercel.app`. JSON only. No credentials or cookies required. Same-origin browsers; command-line/MCP clients may omit Origin. No CORS wildcard. A future browser-origin allowlist requires an explicit reviewed code change.

## Endpoints

| Method/path | Input | Output |
|---|---|---|
| POST `/api/v1/routes/plan` | objective (12–2,000 chars), contextUrl? (HTTPS, max 500), budgetUsd (0–10, whole cents), optimizationPolicy, mode:`demo` | ObjectiveFrame, ExecutionRouteContract, decompositionSource, freshnessSummary, warnings, executionStatus |
| GET `/api/v1/catalog` | capability, source, listingType, freshness, actionability, priceModel, maxPriceUsd, query (120 chars), limit (1–50) | normalized bounded sample, matchedCount, truncated, source health |
| GET `/api/v1/catalog/{id}` | URL-encoded ID from catalog; max 240 chars | one current normalized listing; 404 if missing |
| POST `/api/v1/opportunities/evaluate` | opportunityId, agentProfile:`default_demo_profile` | assumptions, projectedMarginUsd:null when insufficient evidence, execution_not_enabled |
| GET `/api/v1/network/status` | none | source health, freshness, cache-mode warning; no raw records/secrets |
| GET `/api/v1/openapi` | none | OpenAPI 3.1 documentation |

Filters are local to a sampled catalog, not arbitrary upstream API queries. Unknown/duplicate query fields are rejected. No cursor is implemented. Maximum-price filter only considers exact structured service prices; unknown and modeled prices cannot pass as exact.

```bash
curl 'https://signalforge-rose-two.vercel.app/api/v1/catalog?capability=news_search&limit=10'

curl https://signalforge-rose-two.vercel.app/api/v1/routes/plan \
  -H 'Content-Type: application/json' \
  -d '{"objective":"Build a route to extract and validate structured company data from a website","contextUrl":"https://example.com","budgetUsd":0.25,"optimizationPolicy":"best_value","mode":"demo"}'

curl https://signalforge-rose-two.vercel.app/api/v1/opportunities/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"opportunityId":"demo:opportunity-1","agentProfile":"default_demo_profile"}'
```

Response envelope (abbreviated, not an actual execution):

```json
{
  "objectiveFrame": {"objectiveType":"data_enrichment","requiredCapabilities":[]},
  "route": {
    "schemaVersion":"1.0",
    "status":"planned",
    "executionMode":"demo_simulation",
    "executionStatus":"execution_not_enabled",
    "budget":{"hardCapUsd":0.25,"estimatedRouteCostUsd":0.05,"actualCostUsd":0,"currency":"USD"},
    "provenance":{"isSimulated":true,"servicesCalled":false,"paymentsMade":false}
  },
  "decompositionSource":"local_demo_fallback",
  "freshnessSummary":[],
  "warnings":["Discovery and planning only"],
  "executionStatus":"execution_not_enabled"
}
```

Arrays/contract fields above are shortened for readability. Actual outputs contain capability dependencies, provider rationales, rejected alternatives, fallbacks, stop conditions and observed catalog matches. Catalog-only observations are never promoted to executable steps.

## Limits and errors

Planning/decomposition/compile share 10 requests/client-key/rolling 10 minutes with Redis; memory fallback uses a conservative fixed 10-minute window. Catalog/MCP protocol requests share 60/10 minutes. MCP planning also consumes planning quota. `429` includes `Retry-After`; `400` invalid input, `413` body >16 KiB, `403` invalid Origin, `404` missing listing, `503` shared infrastructure or catalog unavailable. No stack traces or vendor error bodies.

Without shared configuration, limits/cache leases are **per instance only**, reset on cold start, and are not launch-grade distributed protection. Configure the shared store before high-traffic use. Error responses and current API data use `Cache-Control: no-store` so a CDN cannot relabel old responses as live or bypass quota checks.

## Browser/legacy surfaces

`POST /api/frame` streams typed objective-decomposition events; `POST /api/routes/compile` compiles a validated frame without a second model call. Operator constraints and critical needs are enforced again server-side. Legacy `/api/plan` and `/api/run` remain isolated deterministic local research-fixture operations for regression compatibility; neither invokes external providers. They are not live execution APIs.
