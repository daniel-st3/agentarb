# SignalForge V2 Experience Blueprint

## The first ten seconds

The homepage opens as a market instrument, not a chat box. A concise headline establishes the job: find agent work whose economics can survive fulfillment. Beside it, the **Profit Engine** presents one current source-ready opportunity when available—or an explicit no-current-opportunity state. Four compact facts are enough: observed reward, known spend, economic completeness, and decision. Two actions lead to Radar and Forge Lab.

The interaction starts from evidence, not an empty prompt. A vertical signal trace connects source observation to cost, risk, and decision. Nothing displays a positive result until inputs are sufficient.

## Profit Engine story

Selecting a real opportunity expands an underwriting sequence in place:

1. **Capture:** show source, timestamp, eligibility, reward, spend, bond, and missing fields.
2. **Route:** map required capabilities to candidate fulfillment routes.
3. **Compress:** rejected routes collapse with named reasons; the viable route retains provenance.
4. **Price:** the Economic Waterfall separates observed value, published price, market rate, operator assumptions, and derived totals.
5. **Decide:** the result morphs from `INSUFFICIENT DATA` to a conditional state only after the operator applies assumptions.

Desktop may use a split instrument layout with a sticky decision rail. Mobile uses a linear ledger: opportunity → missing inputs → route → economics → decision. Neither requires horizontal chart panning for core facts.

## Radar to underwriting

Radar remains the real-demand entry point. Rows prioritize source, reward, known cost, freshness, confidence, and decision completeness. Opening a row reveals the opportunity’s hostile/untrusted text as plain data, followed by “Complete the economics.” Inputs are requested only when missing; typing is local, and **Apply assumptions** is the explicit server boundary.

States are first-class:

- **Loading:** preserve table geometry and announce the bounded snapshot read.
- **Degraded source:** retain last-good timestamp and label it cached/degraded.
- **No data:** show zero opportunities without fixtures.
- **Unknown data:** render an em dash plus the missing reason, never zero.
- **Error:** retain the prior safe state and offer a bounded retry where allowed.

## Forge Lab

Forge Lab is for user-defined tasks, not observed opportunities. The operator provides an objective, constraints, budget, and policy. Missing payout is displayed as **not supplied / unknown**, so the Lab can compare routes and costs without claiming profitability. Optional decomposition suggests capabilities; deterministic code owns route selection.

Observed marketplace tasks carry source provenance and immutable source economics. User tasks carry `user_scenario` provenance. The two may share route and cost primitives but never share labels implying equal evidence.

## Route Arena

Route Arena compares two to four bounded candidates on a shared capability axis. Each lane shows selected providers, dependencies, fallback status, cost ceiling, latency estimate, verification coverage, freshness, and elimination reasons. It should answer “why this route?” before showing a score. Catalog-only or unavailable options remain visible as observed context and cannot appear as executed steps.

## Economic Waterfall and Profit Frontier

The Waterfall begins with gross reward, then subtracts known external spend, bounded provider cost, fees, review, and explicit risk adjustments. Capital and refundable bond sit on a separate rail. Unknown components interrupt the waterfall rather than being silently treated as zero.

Profit Frontier is a sensitivity plot, not a forecast. Axes use operator-controlled variables such as success probability and fulfillment cost; regions show conditional decision thresholds. The current scenario is a marked point. Every axis and tooltip names provenance, and an accessible table provides equivalent values.

## Signal Tests

Signal Tests are named, reversible scenarios: “provider cost +20%,” “FX stale,” “verification required,” or “success probability at break-even.” They run locally when existing deterministic inputs suffice; otherwise they use the existing bounded evaluation API after explicit submission. Tests never mutate the source observation or masquerade as predictions.

## Receipts and strategy

The receipt is a shareable editorial artifact containing observation time, assumptions, route, economic evidence, decision, model/policy versions, and SHA-256 fingerprint. Sharing/export is explicit because objectives may be sensitive.

Strategy Engine later saves named policy bundles—not tasks, credentials, or automatic actions. Watches apply a strategy to future read-only observations and notify on threshold changes. Historical snapshots create the evidence base for later backtesting. Backtests replay only what was actually observed at that time; Agent Passport uses only verified outcome events.

## Responsive and accessible behavior

- Preserve semantic tables or equivalent row roles, visible focus, native controls, and status announcements.
- Replace pinned or spatial competition with ordered sections below 768px.
- Keep financial values tabular and prevent translated labels from clipping.
- Reduced motion renders the final state, plus textual selected/rejected reasons.
- Color never carries decision, provenance, or uncertainty alone.
