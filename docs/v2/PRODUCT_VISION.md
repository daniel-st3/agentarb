# SignalForge V2 Product Vision

## Product promise

SignalForge is an economic operating system and underwriting layer for agent work. It turns observed paid work or a user-defined task into a capability route, a bounded cost model, a conditional economic decision, and an auditable receipt. It does not execute the route.

The product loop is:

```text
OBSERVE WORK
→ UNDERSTAND OBJECTIVE
→ MAP REQUIRED CAPABILITIES
→ COMPETE FULFILLMENT ROUTES
→ PRICE TRUE COST
→ MODEL RISK
→ CALCULATE CONDITIONAL ECONOMICS
→ EXPLAIN DECISION
→ RECORD OUTCOME EVENTUALLY
→ IMPROVE FUTURE UNDERWRITING
```

“Profit” is never a decorative number. It is either unknown, conditional on named assumptions, or—only after future verified outcomes—realized.

## Wedge

Agent ecosystems expose offers, tools, and paid work, but they do not answer the operator’s hardest question: **does a feasible fulfillment route still make economic sense after cost, uncertainty, evidence requirements, and constraints?** SignalForge begins with read-only underwriting because it is useful before execution, avoids custody and marketplace-action risk, and creates the decision contract a future executor would need.

Initial users:

- solo agent builders comparing paid work with available capabilities;
- technical operators deciding whether a task is routable and worth pursuing;
- API/MCP developers needing a machine-readable underwriting contract;
- researchers studying emerging agent-service supply and demand.

SignalForge should not become a generic marketplace. Listings are observations, not inventory owned or endorsed by SignalForge. It should not become a chatbot: natural-language decomposition is an input aid, while deterministic policy and exact arithmetic remain authoritative.

## Product surfaces

- **Profit Engine:** signature homepage transformation from observed economics to an honest decision state.
- **Live Opportunity Radar:** source-first demand inspection and underwriting entry point.
- **Forge Lab:** operator-defined tasks and assumptions, clearly distinct from observed marketplace work.
- **Route Arena:** side-by-side fulfillment routes with elimination reasons.
- **Economic Waterfall:** reward-to-cost-to-risk decomposition with field-level provenance.
- **Profit Frontier:** sensitivity boundary across cost, payout, and success assumptions.
- **Signal Tests:** bounded “what would change the decision?” scenarios.
- **Auditable Receipt:** canonical, shareable decision artifact; fingerprint, not signature.
- **Strategy Engine:** future reusable policy bundles, never hidden automation.
- **Watches:** future saved queries and threshold notifications.
- **Historical snapshots:** future append-only market observations.
- **Backtester:** eventual replay against historical snapshots without invented fills or outcomes.
- **Agent Passport:** eventual measured outcome record; no synthetic reputation.

There is no Teams/admin product in V2. Autonomous execution, claiming, payment, submission, and settlement are outside V2.

## Defensibility

Defensibility comes from trustworthy normalization, provenance-aware economics, deterministic route competition, decision receipts, and—later—verified outcome history. Visual polish helps people understand the system; it is not the moat. The compounding asset is a clean record of what was observed, assumed, selected, rejected, and eventually realized.

## Truth contract

- Unknown stays unknown.
- Observed, published, market-observed, user-supplied, derived, and actual values remain distinct.
- A refundable bond is capital, not automatically cost.
- Catalog options are not calls, endorsements, or execution permission.
- Every machine contract retains `execution_not_enabled`.
