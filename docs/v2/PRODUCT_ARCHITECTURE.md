# SignalForge V2 Product Architecture

## Current foundation

The deployed app already separates objective interpretation, deterministic routing, observed catalog data, real-economics underwriting, and machine contracts. It has strict Zod schemas, exact integer money arithmetic, provenance categories, read-only Agent Bounties discovery, durable-cache/rate-limit adapters, REST/MCP/A2A surfaces, and explicit `execution_not_enabled` boundaries. The browser consumes bounded APIs; Groq remains an optional server-only decomposition aid.

V2 should extend this foundation rather than create a parallel product model.

## Capability map

| V2 feature | Classification | Available now | Required addition / honest limit |
| --- | --- | --- | --- |
| Profit Engine | presentation-only + existing domain data | observed opportunity, economics completeness, decision states | signature transformation and honest empty/unknown state |
| Live Opportunity Radar | existing API/data + presentation | observed tasks, source freshness, evaluation endpoint | tighter workstation hierarchy; do not imply inventory ownership |
| Forge Lab | existing ObjectiveFrame/route data + API extension | user objective, capability route, budget/policy | unify economic assumptions with user-defined tasks; payout remains unknown unless supplied as `user_scenario` |
| Route Arena | presentation + new deterministic comparison projection | selected/rejected providers and reasons | expose comparable route candidates and scoring components without changing planner authority |
| Economic Waterfall | presentation-only | exact observed, published, assumed, and derived fields | deterministic series projection; incomplete inputs stay open/unknown |
| Profit Frontier | new deterministic domain projection | economics formulas and bounded scenarios | sensitivity grid over explicit ranges; no probability inferred from fixtures |
| Signal Tests | new deterministic domain model + API extension | planner/economics can be rerun | named counterfactuals, immutable input set, deterministic delta report |
| Auditable Receipt | existing domain/API | canonical JSON, fingerprint, claim-readiness data | shareable artifact needs durable immutable public storage and privacy policy; download works now |
| Strategy Engine | new domain model + persistence | policy enums and assumptions exist | versioned strategy template, ownership, retention, and evaluation semantics |
| Watches | persistence + scheduler + future notification integration | source snapshots and connectors exist | saved query, cadence, last cursor, deduplication, notification preference; no marketplace action |
| Historical snapshots | persistence/history requirement | transient/stale-last-good cache only | append-only normalized observations with source time and schema version |
| Backtester | persistence + new deterministic model | not honestly available | requires sufficient historical snapshots, versioned pricing/FX, strategies, and outcome-free counterfactual rules |
| Agent Passport | future external integration + measured outcomes | outcome schema/interface, zero observations | signed/verified outcome evidence, identity model, anti-gaming, minimum sample sizes; never synthesize reputation |

## Integration seams

### Forge Lab and observed work

Represent both as an underwriting subject with a source discriminator. An observed task carries immutable source economics; a user-defined task can carry explicit scenario values but must never acquire `observed_source` provenance. Both may feed the same capability planner and economic calculator.

### Route Arena

Add a deterministic `RouteCandidateSet` projection rather than recomputing scores in the client. Each candidate should include capability coverage, ordered dependencies, known cost envelope, verification coverage, score components, rejection reasons, and provenance. The existing `ExecutionRouteContract` remains the selected contract.

### Profit Frontier and Signal Tests

Create pure functions over versioned inputs. A frontier evaluates a bounded grid of workload, success probability, and cost assumptions; a Signal Test changes one or more explicitly named inputs and returns a before/after delta. Neither writes outcomes or implies forecast calibration.

## Historical data without execution

A scheduled, server-owned observer may capture official read-only sources at conservative source-specific intervals. It should use fixed connectors, conditional requests, distributed leases, bounded payloads, and environment-scoped durable storage. Persist normalized observations plus a hash/reference to the source snapshot—not arbitrary HTML or unbounded raw payloads. Missing polls remain gaps; do not interpolate them.

Minimum future records:

```text
MarketSnapshot(id, sourceId, observedAt, freshness, schemaVersion, recordCount, contentHash)
OpportunityObservation(snapshotId, opportunityId, economicFields, eligibility, deadline, provenance)
PricingObservation(providerId, modelId, observedAt, exactRates, currency, sourceUrl)
FxObservation(pair, observedAt, rateMicros, sourceUrl)
Strategy(id, version, publicOrOwnerRef, policy, assumptions, createdAt)
EvaluationRun(id, subjectRef, snapshotRefs, strategyVersion, receiptHash, createdAt)
OutcomeEvent(id, routeId, eventType, metrics, evidenceRef, observedAt)
```

Use append-only events or immutable versions. Authentication is not needed for public browsing or local experiments; it becomes necessary before private saved strategies, watches, or share controls. Do not introduce accounts merely to ship visual prototypes.

## Principal gaps

1. No durable product history: current history/session data is not a market time series.
2. No measured provider outcomes: reliability and success cannot become defensible reputation yet.
3. Forge and observed underwriting are adjacent flows rather than one coherent workstation.
4. Candidate route comparison is not a first-class API projection.
5. Receipts download locally but lack privacy-aware immutable sharing.
6. Watches need scheduling, deduplication, ownership, and notification policy.

These gaps constrain Strategy Engine, Backtester, and Agent Passport. V2 must present them as staged infrastructure, not available capability.
