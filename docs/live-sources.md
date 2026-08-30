# Live source assessments

Verified 2026-08-30. These are engineering access assessments, not a legal opinion or a claim of endorsement. Only the four fixed catalog GETs below are enabled. No HTML scraping, target-service requests, account access, SDK wallet code, or marketplace participation.

## Official MCP Registry — enabled

- Purpose: discover publisher-supplied MCP server metadata, not tools to execute.
- Official docs: https://modelcontextprotocol.io/registry/registry-aggregators and https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md
- Terms: https://modelcontextprotocol.io/registry/terms-of-service
- Exact GET: `https://registry.modelcontextprotocol.io/v0.1/servers?limit=30&version=latest&search=search`
- Authentication: none for reading. Aggregator documentation explicitly provides an unauthenticated read-only REST API; publishing authentication is not used. General terms mention login methods, while the specific consuming documentation explicitly authorizes unauthenticated aggregation. Stop and reassess if this changes.
- Permission basis: aggregator usage explicitly described; registry metadata dedicated to CC0. This does not license packages, authenticate providers, or endorse listed servers.
- Refresh: at most once/hour per cache lease, consistent with official hourly aggregation guidance. No numeric vendor quota stated in reviewed docs. One page of 30 search-related entries, no public upstream pagination/search passthrough.
- Available: name, title, description, version, status, registry update timestamp. Price, measured latency, measured reliability, quality, access gates, reputation, payout and deadlines are not established. Capability tags are text inferences, explicitly labeled.
- Staging registry is documented; no testnet or chain interaction is used. Neither staging nor listed server URLs are fetched.
- Data limitations: preview API; publisher descriptions may be inaccurate/untrusted. Deleted/deprecated entries excluded. Registry publication is not a security review. False access flags accompany `requirementsKnown:false`, never a claim that access is free or unauthenticated.
- What we do not do: contact, install, invoke or authenticate any listed MCP server.

## APIs.guru OpenAPI directory — enabled, bounded NYT provider sample

- Purpose: a distinct, curated API-definition catalog, not a live news/research provider.
- Official API definition: https://api.apis.guru/v2/openapi.yaml (`GET /{provider}.json`, security: empty).
- Project/API documentation: https://apis.guru/api-doc and https://github.com/APIs-guru/openapi-directory
- License/access terms: https://github.com/APIs-guru/openapi-directory#licenses and https://github.com/APIs-guru/openapi-directory/blob/main/LICENSE
- Exact GET: `https://api.apis.guru/v2/nytimes.com.json`
- Authentication: none. Project explicitly recommends its REST API for third-party integrations. API specification and contributed directory material are CC0; project distinguishes acquired definitions under fair use. SignalForge displays limited descriptive catalog metadata with attribution, not full third-party specifications or articles. Underlying provider terms still govern any future use.
- Refresh: hourly, at most one fixed provider sample (up to 50 entries); no published numeric quota located. No crawl of all providers/specs.
- Available: API title, description, version, directory update date, API-definition references. No defensible price, measured quality/latency/reliability, payout, reputation or deadlines.
- Live means this catalog response was observed. Several definitions retain 2021 update timestamps; UI displays them separately. This is not a current NYT service availability check.
- No documented directory sandbox is required/used. No underlying NYT APIs, registration links, article content, or listed URLs are fetched.
- Source trust: curated, not first-party NYT verification. Capability tags are inferred and unknown pricing remains unknown.

## Models.dev — enabled, bounded Groq text-model sample

- Official API documentation: https://github.com/anomalyco/models.dev/blob/dev/README.md (API section).
- Exact GET: `https://models.dev/api.json`; no auth, cookies, body, redirects or alternate URL.
- License: https://github.com/anomalyco/models.dev/blob/dev/LICENSE (MIT, copyright 2025 models.dev). Public API documentation explicitly invites data access. Attribution/license notice retained in `docs/catalog-notices.md`.
- This is a community-maintained database, not a first-party Groq availability/pricing guarantee.
- Source fields: model ID/name, text modalities, last-updated date, optional input/output USD per million tokens. Inferred field: synthesis capability from text input/output.
- Only Groq text-to-text entries are exposed (11 observed on 2026-08-30); at most 30. Audio-only and deprecated entries excluded. No models are invoked.
- Pricing stays raw unit-qualified text with estimated confidence and no `amountUsd`; it cannot be sorted or used as an exact per-task execution cost.
- Refresh every six hours; no numeric public quota found. Single documented static JSON API, not HTML crawling; robots restrictions on website scraping are not used to bypass any access gate. Max 6 MB; observed response approximately 4.44 MB. No endpoint/provider configuration fields forwarded.

## LiteLLM model cost map — enabled, bounded Mistral chat-model sample

- Official docs: https://docs.litellm.ai/docs/proxy/custom_pricing (model cost map).
- Official schema: https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.schema.json
- Exact GET: `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`.
- Permission: https://github.com/BerriAI/litellm/blob/main/LICENSE licenses content outside enterprise/ under MIT (copyright 2023 Berri AI). The root cost map is outside enterprise/. Documentation explicitly publishes this map for pricing integration. No GitHub HTML scraping, authenticated API, or model requests. Notices retained.
- Source fields: provider slug, mode, input/output USD per token, optional deprecation date. Inferred: synthesis capability from chat mode. Catalog prices may lag provider terms; no measured reliability or vendor endorsement.
- Bounded sample: first 25 non-deprecated Mistral chat entries, 25 observed on 2026-08-30. Sample order follows published map, not a completeness claim. Token prices are not per-task quotes; no exact route cost inferred.
- Refresh six-hourly; no numeric raw-file quota found, so conservative fixed-file reads and shared leases. Max 4 MB, observed approximately 2.01 MB. Only this fixed raw JSON file may use text/plain content type; all other connectors require JSON content type.
- Models.dev and LiteLLM are separate catalog observations, not independent corroboration of research claims. Their underlying inventories may overlap. Neither source enables inference execution.

## Disabled candidate assessments

The registry lives in `apps/signalforge/src/server/intelligence/connectors/candidates.ts`.

| Candidate | Official reference | Gate / limitation |
|---|---|---|
| OpenRouter models catalog | https://openrouter.ai/docs/guides/overview/models ; https://openrouter.ai/terms (July 29, 2026) | Public API docs describe model metadata, but terms include restrictions on copying service information and developing competing services. Redistribution permission for this control-plane catalog was not established; disabled without an API request. |
| Coinbase Bazaar | https://docs.cdp.coinbase.com/x402/buyer/discover-services ; https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/list-x402-resources | Public discovery is explicitly documented without a key, but https://www.coinbase.com/legal/developer-platform/terms-of-service §9 restricts sharing API data with third parties without written authorization. Disabled; no catalog API request made. No payment, wallet or chain SDK installed. |
| OpenTask | Legacy Python research remains in repository documentation | Current public redistribution/access terms not verified for this increment. Not enabled or presented as live. No task actions. |
| execution.market | Legacy `docs/verification-execution-market-testnet.md` | Historical technical discovery support is not proof of current redistribution permission. Disabled pending a separate current terms assessment; no execution or testnet interaction. |
| External A2A Agent Cards | https://a2a-protocol.org/latest/definitions/ | Protocol documentation is not permission to fetch arbitrary agents. No individual peer is approved; no user-supplied URLs fetched. |
| Circle marketplace / other x402 directories | No independently verified public redistribution interface in this increment | Unsupported; not fabricated as a third live integration. |

## Freshness and legal-operational controls

- First successful bounded GET response: `live`, stamped at observation. Later cache reads: `cached_live`, preserving that timestamp. A live observation is not an underlying-service test.
- Hourly leases for MCP/APIs.guru and six-hour leases for model catalogs prevent repeated upstream refresh. Redis makes leases shared; memory mode does not coordinate cold starts and is explicitly a non-durable demo limitation. Eligible stale snapshots are returned immediately while Next.js `after()` refreshes under the lease.
- Upstream timeout 5s; one 250ms retry for network TypeError/5xx only. No retry on 401/402/403/429 or redirects. Byte limits: MCP/APIs.guru 1 MB, Models.dev 6 MB, LiteLLM 4 MB; Zod parsing before normalization; no raw payload storage or client forwarding.
- Failed refresh retains last successful snapshot for at most 24 hours with degraded/cached labels. Three consecutive failures pause attempts for six hours. After 24h, no records are shown as usable cached data.
- Source records and aggregate health only in cache; never visitor objectives, policy inputs or credentials.
- Simulated service/task fixtures are separately labeled `simulated_demo`. No static data is passed off as live. No task marketplace passed the gate, so task-opportunity examples are controlled fixtures only.

## Adding a connector

Record official access/redistribution permission, terms, authentication, quotas and fields first. Add a fixed URL, a module with a bounded raw Zod schema, parser fixtures, output-schema checks, and GET-only transport tests. Add no action methods. Preserve unknown fields as unknown and expose observed timestamps, source attribution and access uncertainty. A future executable adapter requires a separate terms/authentication/authorization/budget/security review; catalog registration never enables it.
