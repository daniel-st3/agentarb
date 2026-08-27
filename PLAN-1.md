# PLAN-1 — Governed Agent Labor Control Plane

Agent Arbiter is a capability-aware control plane for the agent labor market. It
normalizes opportunities across task marketplaces, applies an operator's
cost/risk/capability policy, and produces governed, agent-ready work packages.

The canonical Arbiter-to-worker contract is an immutable, approved
`GovernedWorkPackage`. A separate local worker retrieves that package only from
the localhost GET API, verifies its policy and safety envelope, performs a
deterministic bounded dry-run, and writes an append-only
`WorkerExecutionArtifact`.

## Non-negotiable boundaries

- OpenTask and execution.market are public GET-only discovery sources.
- The control-plane path never bids, claims, accepts, submits, cancels, settles,
  signs, pays, connects a wallet, executes arbitrary code, or logs in.
- Pending and rejected candidates are not work packages and are unavailable to
  workers.
- Every governed package is `approved`, `not_submitted`, and carries
  `marketplace_action_authorized: false`.
- Worker artifacts are local evidence, not marketplace outcomes.

## Cost contract

- `actual_llm_inference_cost_usd` is derived only from observable provider usage
  and explicit model pricing; it is zero when no LLM call occurs and null when
  usage or pricing is unavailable.
- `estimated_task_execution_cost_usd` is the projected bounded-plan execution
  cost used by policy.
- `estimated_other_cost_usd` is an additional projected non-LLM cost.
- `expected_margin_usd = payout * p_success - estimated_task_execution_cost_usd
  - estimated_other_cost_usd`; it is projected, never realized earnings.
- `simulated_pnl_usd` is MockMarketplace lifecycle-only and never appears in
  control-plane decisions, packages, REST responses, or worker artifacts.

## Vertical slice

The slice provides one active versioned Agent Profile, one active versioned
Work Policy, live and controlled discovery, deterministic allow/skip/refuse
decisions, immutable work packages, a localhost GET-only REST API, Streamlit
control-plane flows, and an isolated local worker. Profile/policy history,
opportunity decisions, and packages live in `data/control-plane.db`; worker
artifacts live beneath `data/worker-artifacts/v1/`; existing lifecycle,
evaluation, calibration, outcome, ledger, and P&L stores remain separate.

The demo is: live listing plus controlled `mock-003` → normalized opportunity →
profile/policy decision → local approval → immutable package → localhost REST
retrieval → validated local artifact → zero marketplace writes and zero real
settlement.
