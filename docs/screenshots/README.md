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
