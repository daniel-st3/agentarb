# Dashboard screenshots

Captured 2026-08-23 from a live run (`uv run streamlit run src/arbiter/dashboard.py`)
against real OpenTask and execution.market data plus MockMarketplace.

| File | Shows |
|---|---|
| `00-overview.png` | Header, risk limits, today's simulated P&L |
| `01-queue.png` | Approval queue — bounties suspended at the LangGraph claim gate |
| `02-ranked.png` | Scored bounties ranked by expected value |
| `03-skipped.png` | Skip reasons — the judgment, not just the shortlist |
| `04-tasks.png` | Task outcomes with `deliverable_state` and validation notes |
| `05-calibration.png` | Predicted vs. actual: Brier, bias, reliability bands |
| `06-marketplaces.png` | Declared capabilities per connector, and why |
| `07-audit.png` | Append-only orchestrator event log |

The calibration screenshot uses seeded outcomes so the reliability bands are
legible; every one is flagged `simulated`. `arbiter calibrate --real-only`
reports zero real outcomes.

Fresh read-only captures from 2026-08-26:

| File | Shows |
|---|---|
| `2026-08-26-evidence-overview.png` | Four-way evidence model and explicitly simulated $0 P&L |
| `2026-08-26-golden-evaluation-review.png` | Offline/never-submitted review tab, v1 benchmark metrics, and live-discovery evaluation count |

The v1 corpus is synthetic and fully offline. The 10 evaluation rows shown came
from earlier public OpenTask discovery and remain `not_submitted`; the displayed
`estimated_task_execution_cost_usd` is a projection, not spend. Real marketplace
outcomes remain zero.

Fresh governed-control-plane captures from 2026-08-27:

| File | Shows |
|---|---|
| `2026-08-27-control-plane-opportunities.jpg` | Live OpenTask discovery, genuine zero-result execution.market status, controlled mock fixtures, exact allow/skip/refuse rationale, and separately labelled projected costs |
| `2026-08-27-governed-package.jpg` | Immutable approved package hash, localhost GET URL, projected expected margin, and persistent `not_submitted` / marketplace-action-disabled state |
| `2026-08-27-worker-artifact.jpg` | Append-only local worker evidence with `external_actions_taken=false`, `marketplace_submission_status=not_submitted`, and zero actual LLM inference cost |

The mock package and worker artifact are visibly controlled local evidence. They
are not live marketplace outcomes and do not update lifecycle settlement,
calibration, or P&L.

Premium portfolio UI captures from 2026-08-27:

| File | Shows |
|---|---|
| `2026-08-27-premium-overview.jpg` | Editorial control-plane landing view, operational metrics, authority-narrowing architecture, and the four evidence classes |
| `2026-08-27-premium-opportunity-feed.jpg` | Professional read-only opportunity terminal with unmistakable live/mock sources, decisions, confidence, payout, and projected-cost separation |
| `2026-08-27-premium-agent-profile.jpg` | Active immutable profile metadata, bounded tools/categories, projected-cost ceiling, and prohibited actions |
| `2026-08-27-premium-governed-package.jpg` | Contract-style approved package, canonical hash, local-worker approval, and persistent marketplace-action-disabled boundary |
| `2026-08-27-premium-worker-artifact.jpg` | Receipt-style worker proof with hash verification, deterministic dry-run result, and zero external action |
| `2026-08-27-premium-evidence-simulation.jpg` | Golden corpus evidence with real outcomes fixed at zero and simulation/offline evidence kept secondary |

These captures use the app's local system-font stack and CSS-only motion. No
external visual asset, web-font, or JavaScript animation dependency is required.
