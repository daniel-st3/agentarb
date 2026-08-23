# Agent Arbiter

A **router/arbitrage layer across AI-agent task marketplaces.** Not another
marketplace and not another agent — the trader that sits above them, scores
every open bounty by expected profit vs. effort vs. actual capability, and
decides which are worth doing.

> **Status: Week 3 — multi-marketplace router with calibration.** It scans two
> real marketplaces plus a mock, scores every bounty, and stops at a human
> approval gate. On approval it claims, executes, submits, and settles — but
> only against MockMarketplace, whose settlement is explicitly simulated.
> **There is no wallet code in this repo and nothing here moves real or testnet
> funds.**

## Why it's interesting

The marketplaces are genuinely incompatible with each other: open pull-claim
vs. bid-and-wait vs. buyer-hires-you; on-chain escrow vs. off-platform
invoicing; with and without a human accept-gate. A single uniform loop does
not fit all of them. Normalizing that heterogeneity behind one connector
Protocol — and representing the differences *honestly* rather than pretending
a push-market into a pull loop — is the hard part and the centrepiece.

```
  ┌──────────────── DISCOVERY (real, read-only) ──────────────┐  ┌── PAID LOOP ──┐
  │  opentask            execution_market                      │  │  mock         │
  │  bid · off-platform  pull-claim · MAINNET escrow           │  │  simulated    │
  │  no escrow           reputation-gated                      │  │  settlement   │
  └───────────────────────┬───────────────────────────────────┘  └───────┬───────┘
                          │        normalized Bounty                     │
                          └──────────────────┬───────────────────────────┘
                                             ▼
                                     Scoring Agent
                            skip-filter → estimate → formula
                                             │
                                             ▼
                                        RiskGuard
                              caps · margin · circuit breaker
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │   CLAIM GATE    │ ◄── human decides
                                    │   interrupt()   │     (checkpointed)
                                    └────────┬────────┘
                                             │ approved
                                             ▼
                    safety screen → execute → validate → submit → settle
                    harmful/       category    grade to    only if    simulated
                    ambiguous/     router      draft/      SUBMISSION only
                    out-of-scope               validated   _READY
                    refused                    /ready
                                             │
                                             ▼
                              SQLite audit trail + outcomes
                                             │
                                             ▼
                          Calibration ──────────────► Streamlit dashboard
                    predicted p_success vs. actual
```

**Only MockMarketplace can close a paid loop today.** That is a finding, not a
shortcut — see [Marketplaces](#marketplaces).

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

uv run arbiter markets                 # what each marketplace can actually do
uv run arbiter calibrate               # predicted vs. actual, by category/market
uv run arbiter calibrate --real-only   # excludes simulated outcomes (expect: none)
uv run arbiter estimate-check          # sanity-check estimator output

uv run streamlit run src/arbiter/dashboard.py
uv run pytest                          # add -m live for network tests
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
| **execution.market** | `GET /api/v1/tasks/available`, `/api/v1/tasks/{id}` — public, unauthenticated | open pull-claim | **x402r escrow, Base mainnet only** | verification | **Discovery only** |
| **MockMarketplace** | local | open pull-claim | simulated | none | **The only paid loop** |

Both real marketplaces are **discovery-only, for different reasons** — which is
precisely the heterogeneity this project exists to handle:

**execution.market** has real platform escrow, but no testnet. `escrow/config`
is pinned to `chain_id: 8453` (Base mainnet) with mainnet USDC and a single
deployed escrow address; `x402/info` lists ten mainnets enabled and zero
testnets. Accepting a task also needs EIP-3009 signing and clears a per-task
`min_reputation` gate. So joining its paid loop would mean real funds on
mainnet — out of scope until a gated Week 4 task. The connector lists and
scores live tasks and refuses every write path. Full write-up in
`docs/verification-execution-market-testnet.md`.

**OpenTask** cannot close a paid autonomous loop for the opposite reason —
no escrow at all: its terms state it "does not
custody funds, hold escrow, control private keys, or sign wallet transactions
for you." It is an excellent *discovery* source and is treated as exactly
that.

**MockMarketplace therefore carries the end-to-end control flow.** It is the
only connector where `supports_open_claim`, `supports_autonomous_settle`, and
a submittable deliverable line up — so it proves claim → execute → submit →
settle works, deterministically and with no funds at risk, while the two real
markets prove the *router* half of the story.

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

## Deliverable states

Execution output is graded before it can be called ready. The grading happens
in exactly one function, so the invariant holds everywhere:

| State | Meaning |
|---|---|
| `simulated` | Stub content — no LLM ran. **Never submittable.** |
| `draft` | Real generated content that failed validation. |
| `validated` | Passed the category's structural checks. |
| `submission_ready` | Validated, non-stub, on a market that can accept it. |

A stub can never rise above `simulated`, whatever its content, and the submit
node refuses to hand anything below `submission_ready` to a non-simulated
marketplace.

Before any of that, a safety screen refuses four kinds of work outright, so no
tokens are spent on them: **unsupported** category, **harmful** (malware,
phishing, access-control bypass, forgery, doxxing, impersonation),
**out of scope** (physical presence, credentials, executing untrusted code,
moving funds), and **ambiguous** (placeholder or too-thin descriptions).

## Calibration

Every completed attempt records what the scorer predicted next to what
happened, so the question "is this thing actually any good at judging?" has a
number rather than a vibe.

- **Brier score** — mean squared error of `p_success`. Lower is better.
- **Bias** — predicted minus actual. Positive means over-confident.
- **Reliability bands** — when it says 0.7, does ~70% succeed?
- Sliced by category and marketplace, with **simulated outcomes separable**:
  `arbiter calibrate --real-only` currently reports zero, because every paid
  action so far is simulated. That number staying honest is the point.

Measured bias feeds back into future estimates via `adjustment_for()`, which
returns 1.0 until it has at least 5 samples and is clamped to [0.5, 1.5] — a
calibration layer that reacts to two data points is noise, not learning.

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
    execution_market.py  read-only, live
    mock.py       local, deterministic
  llm.py          estimator + completions: Groq or offline fallback
  scoring.py      skip-filter + formula + ranking
  risk.py         RiskGuard: spend caps + circuit breaker
  executors/      research / summarization / small_code / data_lookup
    router.py     category -> handler; unknown declines honestly
    safety.py     refuses harmful / out-of-scope / ambiguous work
    validation.py grades output: simulated -> draft -> validated -> ready
  graph.py        LangGraph state machine with the interrupt() claim gate
  orchestrator.py start / resume / approval queue
  calibration.py  predicted p_success vs. actual; Brier, bias, adjustment
  pipeline.py     scan -> score -> rank -> record
  cli.py          scan · run · queue · approve · reject · calibrate · markets
  dashboard.py    Streamlit + approve/reject queue
```
