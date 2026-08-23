# Agent Arbiter

A **router/arbitrage layer across AI-agent task marketplaces.** Not another
marketplace and not another agent — the trader that sits above them, scores
every open bounty by expected profit vs. effort vs. actual capability, and
decides which are worth doing.

> **Status: Week 1 — alert-only.** It scans, scores, ranks, and logs. It does
> not claim, execute, or move money. There is no wallet code in this repo.

## Why it's interesting

The marketplaces are genuinely incompatible with each other: open pull-claim
vs. bid-and-wait vs. buyer-hires-you; on-chain escrow vs. off-platform
invoicing; with and without a human accept-gate. A single uniform loop does
not fit all of them. Normalizing that heterogeneity behind one connector
Protocol — and representing the differences *honestly* rather than pretending
a push-market into a pull loop — is the hard part and the centrepiece.

```
  Connectors ──normalized Bounty──▶ Scoring Agent ──Score──▶ ranking + decision log
  (per market)                      skip-filter,             │
   opentask (read-only)             estimate, formula        ▼
   mock (local, deterministic)                        SQLite audit trail
                                                             │
                                                             ▼
                                                      Streamlit dashboard
```

## Quickstart

```bash
uv venv && uv pip install -e ".[dev]"
cp .env.example .env          # works as-is; no keys needed for Week 1

uv run arbiter scan                    # scan OpenTask (live) + mock
uv run arbiter scan -m mock            # deterministic, offline
uv run streamlit run src/arbiter/dashboard.py
uv run pytest
```

No API key is required. With `ARBITER_LLM_PROVIDER=heuristic` (the default)
the estimator is deterministic and offline; set `groq` plus a key to use an
LLM instead.

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
| execution.market | REST + MCP | accept/claim | x402 escrow, USDC | approval | Week 3 |

OpenTask cannot close a paid autonomous loop: its terms state it "does not
custody funds, hold escrow, control private keys, or sign wallet transactions
for you." It is an excellent *discovery* source and is treated as exactly
that. The paid loop will run on MockMarketplace (simulated) and
execution.market (real x402 escrow).

## Safety posture

- No wallet, key, or payment code exists in the repo at Week 1.
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
  llm.py          estimator: Groq or offline heuristic
  scoring.py      skip-filter + formula + ranking
  pipeline.py     scan -> score -> rank -> record
  cli.py          `arbiter scan`
  dashboard.py    Streamlit
```
