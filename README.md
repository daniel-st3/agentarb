# Agent Arbiter

A **router/arbitrage layer across AI-agent task marketplaces.** Not another
marketplace and not another agent — the trader that sits above them, scores
every open bounty by expected profit vs. effort vs. actual capability, and
decides which are worth doing.

> **Status: Week 2 — human-gated execution on simulated settlement.** It scans,
> scores, and stops at a human approval gate. On approval it claims, executes,
> submits, and settles — but only against MockMarketplace, whose settlement is
> explicitly simulated. **There is no wallet code in this repo and nothing here
> moves real or testnet funds.**

## Why it's interesting

The marketplaces are genuinely incompatible with each other: open pull-claim
vs. bid-and-wait vs. buyer-hires-you; on-chain escrow vs. off-platform
invoicing; with and without a human accept-gate. A single uniform loop does
not fit all of them. Normalizing that heterogeneity behind one connector
Protocol — and representing the differences *honestly* rather than pretending
a push-market into a pull loop — is the hard part and the centrepiece.

```
  Connectors ──normalized Bounty──▶ Scoring Agent ──Score──▶ RiskGuard
  (per market)                      skip-filter,                │
   opentask (read-only)             estimate, formula           │ limits ok?
   mock (local, deterministic)                                  ▼
                                                         ┌─────────────┐
                                                         │ CLAIM GATE  │ ← human
                                                         │ interrupt() │
                                                         └──────┬──────┘
                                                                │ approved
                                     ┌──────────────────────────┤
                                     ▼                          ▼
                            claim → execute → submit → settle (simulated)
                                     │  category router → research /
                                     │  summarization / small_code / data_lookup
                                     ▼
                              SQLite audit trail → Streamlit dashboard
```

## Quickstart

```bash
uv venv && uv pip install -e ".[dev]"
cp .env.example .env          # works as-is; no keys needed for Week 1

uv run arbiter scan                    # alert-only: scan, score, rank
uv run arbiter scan -m mock            # deterministic, offline

# The Week 2 loop: run up to the gate, then decide.
uv run arbiter run -m mock --top 2     # stops at the claim gate
uv run arbiter queue                   # what is waiting, plus today's P&L
uv run arbiter approve mock:mock-007   # claim → execute → submit → settle
uv run arbiter reject  mock:mock-001 --reason "too thin"

uv run arbiter estimate-check          # sanity-check estimator output
uv run streamlit run src/arbiter/dashboard.py
uv run pytest                          # 112 tests; add -m live for network tests
```

No API key is required. The default provider is `auto`: with a Groq key in
`.env` it uses the LLM, and without one it falls back to a deterministic
offline heuristic — so dropping a key in is the only step needed to switch.
Execution handlers behave the same way, returning a clearly-labelled stub
deliverable when no key is present. `arbiter estimate-check` prints the LLM
estimate next to the heuristic baseline for comparison.

## Scoring

A hard skip-filter runs first, in pure Python, so no tokens are spent on
bounties we already know we cannot do:

- category outside the supported handler set
- payout not machine-readable, or below the floor
- marketplace has no open claim (surfaced in the dashboard, excluded from the
  autonomous loop)
- *(post-estimate)* effort over the cap, or payout under est. cost × margin

Survivors get an estimate — `feasibility`, `p_success`, `confidence`,
`est_effort_hours`, `est_api_cost_usd`, `est_gas_cost_usd` — and then:

```
EV     = payout_usd * p_success
net_EV = EV - (est_api_cost + est_gas_cost)
score  = net_EV * feasibility * confidence / effort_hours
```

Every field of every decision, including skip reasons, is written to the
`decisions` table. Bias is conservative throughout: unknown → low p_success.

## Marketplaces

Verified live on 2026-08-23.

| Marketplace | API | Claim model | Settlement | Gate | Role here |
|---|---|---|---|---|---|
| **OpenTask** | `GET /api/tasks`, `GET /api/tasks/{id}` — public, unauthenticated | bid (`executionMode: "pitch"`) | **off-platform, non-custodial** | buyer selects | **Discovery only** |
| **MockMarketplace** | local | open pull-claim | simulated | none | Demo + tests |
| execution.market | REST + MCP | accept/claim | x402 escrow, USDC — **Base mainnet only** | approval | Deferred (see below) |

**execution.market has no testnet escrow.** Its `escrow/config` is pinned to
`chain_id: 8453` (Base mainnet) with mainnet USDC, and `x402/info` shows ten
mainnets enabled and zero testnets. So it cannot join a testnet-first paid
loop; a read-only connector for discovery and scoring remains viable at any
time. Full write-up in `docs/verification-execution-market-testnet.md`.

OpenTask cannot close a paid autonomous loop: its terms state it "does not
custody funds, hold escrow, control private keys, or sign wallet transactions
for you." It is an excellent *discovery* source and is treated as exactly
that. The paid loop will run on MockMarketplace (simulated) and
execution.market (real x402 escrow).

## The claim gate

The gate is a real LangGraph `interrupt()`. The graph suspends there, its
state is checkpointed to SQLite, and it stays suspended — **across process
restarts** — until a human resumes it with a decision from the dashboard or
CLI. Nothing is claimed, executed, or settled before that.

The LangGraph thread id is the bounty key (`marketplace:bounty_id`), the same
idempotency key used for claim/submit/settle, so re-running a bounty resumes
its existing thread instead of starting a second attempt.

`RiskGuard` runs *before* the human is asked, so the queue never contains
something the limits would refuse anyway. Skipped bounties never enter the
queue either.

## Risk controls

| Limit | Question it answers |
|---|---|
| `max_loss_per_day_usd` | Are we losing money today? Trips the circuit breaker. |
| `daily_budget_usd` | How much have we spent today? **Gross** — earnings do not refill it. |
| `max_cost_per_task_usd` | Is any single task too expensive? |
| `cost_safety_margin` | Does payout clear est. cost × margin? |
| `max_tasks_per_day` | Backstop against a runaway loop. |

## Safety posture

- **No wallet, key, or payment code exists in the repo.** Every ledger entry
  is flagged `simulated=True`; the dashboard labels all amounts as simulated.
- Secrets live only in a gitignored `.env`; `.env.example` carries no values.
- Testnet-first (Base Sepolia) when wallet code does land; mainnet is a
  separate, feature-flagged, human-gated path.
- Every decision is an append-only row plus a structured log line.
- Claim/submit/settle are keyed by `(marketplace, bounty_id)` for idempotency.

## Layout

```
src/arbiter/
  config.py       pydantic-settings over .env
  logging.py      structlog (console or JSON)
  models.py       Bounty, Score, capabilities + SQLite tables
  db.py           engine/session helpers
  connectors/
    base.py       the MarketplaceConnector Protocol
    opentask.py   read-only, live
    mock.py       local, deterministic
  llm.py          estimator + completions: Groq or offline fallback
  scoring.py      skip-filter + formula + ranking
  risk.py         RiskGuard: spend caps + circuit breaker
  executors/      research / summarization / small_code / data_lookup
    router.py     category -> handler; unknown declines honestly
  graph.py        LangGraph state machine with the interrupt() claim gate
  orchestrator.py start / resume / approval queue
  pipeline.py     scan -> score -> rank -> record
  cli.py          scan · run · queue · approve · reject · estimate-check
  dashboard.py    Streamlit + approve/reject queue
```
