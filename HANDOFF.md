# Agent Arbiter — Handoff

**Repository:** https://github.com/daniel-st3/agentarb
**Branch:** `claude/verify-bounty-api-facts-f6ccdu`
**Last code commit:** `304fdee42e724e6b7f647aac9d8bd53732e11bd8` — *Dashboard fixes and demo screenshots*
**Handoff commit (docs only):** `607d1a511f01b12640a472ce2be7d5d5b00530c1` — *Add HANDOFF.md and screenshot index*
**Date:** 2026-08-23

> This branch is the only branch in the repository. There is no `main` and no
> open pull request, so there is nothing to merge into yet.

---

## Governed control-plane update — 2026-08-27

The primary product is now a capability-aware control plane for the agent labor
market. One active versioned Agent Profile and Work Policy govern GET-only live
and controlled discovery. An allow decision can create a pending local
candidate; local approval materializes an immutable, hash-verified
`GovernedWorkPackage`. It never authorizes marketplace participation.

The localhost FastAPI service exposes GET endpoints only and returns approved
packages. The separate `arbiter_worker` application retrieves packages only
from loopback, imports no connector/database/lifecycle surface, performs a
bounded deterministic dry-run, and writes append-only artifacts beneath
`data/worker-artifacts/v1/`. Worker terminal states are
`validated_local_artifact` or `refused`; `submission_ready` is impossible.

Control-plane data lives in `data/control-plane.db`, separate from lifecycle,
ledger, outcomes, calibration, P&L, and offline evaluation. Cost fields are
explicit: observed `actual_llm_inference_cost_usd`, projected
`estimated_task_execution_cost_usd`, projected `estimated_other_cost_usd`, and
projected `expected_margin_usd`. `simulated_pnl_usd` remains MockMarketplace
lifecycle-only and never enters a package or worker artifact.

```bash
uv run arbiter refresh-opportunities --marketplace mock --marketplace opentask \
  --marketplace execution_market --limit 10
uv run arbiter serve --host 127.0.0.1 --port 8765
uv run python examples/local_worker_agent.py --api http://127.0.0.1:8765 \
  --package-id wp_... --output-dir data/worker-artifacts/v1
```

All real connectors remain discovery-only. No account, wallet, signing,
payment, x402/CDP, testnet/mainnet, bid, claim, accept, submit, cancel, or
settlement capability was added.

---

## Continuation update — 2026-08-26

The Golden Task Corpus and offline-evaluation phase is complete. The product
statement is now:

> **Agent Arbiter is a capability-aware, cross-marketplace opportunity
> intelligence, safety-routing, and offline-evaluation layer for the emerging
> agent economy.**

### Golden safety benchmark

```bash
uv run arbiter golden-eval --corpus v1
```

- `data/golden_tasks/v1.jsonl` contains 40 versioned, synthetic tasks across
  all supported categories plus ambiguous, unsupported, high-effort,
  low-value, harmful, payment, credential, wallet, marketplace-write,
  external-action, and code-execution risk types.
- The runner is hermetic: it constructs no connector, makes no network call,
  selects no external model even if a Groq key is present, executes no generated
  code, and writes to no database or ledger.
- Category routing classifies tags/title through the same deterministic
  normalizer used by OpenTask before checking handler dispatch; it does not
  simply echo the corpus label.
- Every expected label includes category, allow/skip/refuse, reason where
  applicable, maximum deliverable state, validation result, and conditions.
- A critical unsafe allow or any `submission_ready` state is a hard non-zero
  exit. Tests poison network and connector write/payment paths to enforce this.
- Baseline `v1`: 100% routing and decision accuracy, 100% validation agreement,
  100% precision/recall for allow/skip/refuse, and 0% unsafe false-allows and
  safe false-refusals. These are synthetic offline regression results—not
  marketplace outcomes.

### New workflow

```bash
uv run arbiter evaluate --marketplace opentask --limit 10
uv run arbiter export-evaluations --format csv
```

- Evaluation receives a capability-reducing connector façade exposing only
  public discovery (`list_open`, `get`) and cleanup.
- Bid, claim, accept, submit, settlement, signing, wallet, escrow, and payment
  method access fails closed in evaluation mode.
- Safety screening runs before estimation or generation, so refused work
  consumes no model call.
- Records live in the physically separate `data/evaluations.db`, never in
  lifecycle tasks, outcomes, calibration, the audit ledger, or P&L.
- Every row is visibly labelled `offline_evaluation` / `not_submitted` and
  begins with human review status `pending`.
- With no Groq key, the deterministic fallback remains fully functional and
  visibly labelled. No key is logged, stored in evaluation data, exported, or
  committed.
- The recommended Groq model is `openai/gpt-oss-120b`, configured through
  `ARBITER_GROQ_MODEL`. A model-specific 404 tries
  `ARBITER_GROQ_FALLBACK_MODEL=qwen/qwen3.6-27b` once; if both fail, the
  deterministic heuristic remains the final fallback. Generic 404s are not
  retried as model changes, and logs contain only model IDs plus error
  categories.
- CSV export and the Streamlit **Evaluation Review** tab support six 1–5 human
  quality grades plus `reject`, `revise`, `acceptable`, or `excellent`.
- Dashboard evidence and metrics now distinguish live discovery, offline
  evaluation, simulated lifecycle, and real marketplace outcomes.

### Evidence categories — do not merge these

| Category | Meaning |
|---|---|
| Live discovery | Public marketplace task data fetched read-only |
| Offline evaluation | Local generation and human grading; never submitted |
| Simulated lifecycle | MockMarketplace scan → approval → execution → settlement |
| Real marketplace outcome | Must remain zero without separate explicit authorization |

Tests specifically prove evaluation cannot invoke marketplace write/payment
methods and does not alter lifecycle tasks, outcomes, or the ledger. The
separate evaluation database contains only the `offline_evaluations` table.

Public facts re-verified on 2026-08-26: sampled OpenTask listings remained
`executionMode="pitch"`; execution.market returned no currently available
tasks; `/escrow/config` remained Base mainnet (`chain_id: 8453`); and
`/x402/info` exposed enabled mainnets with zero enabled testnets.

### Fresh screenshots

The dashboard was verified with Streamlit AppTest, a live HTTP session, and the
approved in-app browser. Fresh captures are committed as
`docs/screenshots/2026-08-26-evidence-overview.png` and
`docs/screenshots/2026-08-26-golden-evaluation-review.png`. They visibly
separate live discovery, offline/never-submitted evaluation, simulated
lifecycle/P&L, and zero real marketplace outcomes.

---

## 1. Project status

**Weeks 1–3 are complete.** The system scans two real marketplaces plus a
local mock, scores every open bounty, stops at a human approval gate, and — on
approval — claims, executes, submits, and settles against MockMarketplace
only.

**Week 4 has not started and must not be started without explicit approval
from the repository owner.** See §6.

### What it is

A router/arbitrage layer *across* AI-agent task marketplaces — not another
marketplace and not another agent. The hard part, and the centrepiece, is
normalizing genuinely incompatible marketplaces behind one connector Protocol
while representing their differences honestly rather than pretending a
push-market into a pull loop.

### Health at handoff

| Check | Result |
|---|---|
| Test suite | 277 passed; 3 live tests deselected |
| Live (network) tests | 3 passed separately with `-m live` |
| Lint (`ruff`) | clean |
| Working tree | clean; branch is 2 commits ahead because this host has no HTTPS GitHub credentials |
| Wallet / signing / payment code | **none** (audited by grep) |

---

## 2. Completed features, Week 1–3

### Week 1 — alert-only scanning and scoring
- `MarketplaceConnector` Protocol with explicit per-market capability flags.
- OpenTask connector (list/get, read-only) against verified public endpoints,
  with cursor pagination and conservative budget parsing: free-form text like
  `"From 15 USDC"` is parsed, ranges resolve to the **low** end, and
  non-USD-pegged currencies stay unpriced rather than guessing an FX rate.
- MockMarketplace connector — local, deterministic, seeded to exercise every
  skip-filter branch so a demo shows judgment rather than a uniformly-good list.
- Scoring agent: a pure-Python skip-filter runs **before** any LLM call, then
  an estimate, then `score = net_EV × feasibility × confidence / effort_hours`.
- SQLite audit trail, `structlog`, typed config over a gitignored `.env`,
  `arbiter scan`, and a Streamlit page.

### Week 2 — human-gated execution
- LangGraph orchestrator with a real `interrupt()` at the claim gate. The graph
  suspends, checkpoints to SQLite, and resumes only on a human decision —
  **verified to survive a full process restart**. The thread id is the bounty
  key, so re-running a bounty resumes its thread rather than starting a second
  attempt.
- `RiskGuard`, checked *before* the human is asked, so the queue never holds
  something the limits would refuse. Circuit breaker on net daily loss, plus
  gross spend cap, per-task ceiling, margin floor, and task count. The spend
  cap is deliberately **gross** — earnings do not refill it.
- Four execution sub-agents behind a category router that declines unknown
  categories outright rather than improvising.
- Streamlit approve/reject queue, risk banner, and P&L.

### Week 2.5 — real deliverables, safety, and deliverable states
- Stubs replaced with real bounded generation for all four categories, each
  with an output contract and a validator:
  - **research** — answer / findings / sources / uncertainty; must cite a URL.
  - **summarization** — grounded only in the task text; validation diffs URLs
    in the output against the input and rejects invented citations.
  - **data_lookup** — parseable JSON carrying `records`, `sources`,
    `retrieved_at`.
  - **small_code** — fenced code, explanation, validation notes. The prompt
    forbids claiming to have executed anything. **Nothing runs code.**
- **Deliverable states** graded in exactly one function
  (`executors/validation.py::grade`), so the invariant holds everywhere:

  | State | Meaning |
  |---|---|
  | `simulated` | Stub — no LLM ran. **Never submittable.** |
  | `draft` | Real content that failed validation. |
  | `validated` | Passed the category's structural checks. |
  | `submission_ready` | Validated, non-stub, on a market that can accept it. |

  A stub can never rise above `simulated` whatever its content, and the submit
  node refuses anything below `submission_ready` for a non-simulated market.
- **Safety screening** before a token is spent, refusing four kinds of work:
  unsupported category, **harmful** (malware, phishing, access-control bypass,
  forgery, doxxing, spam, impersonation), **out of scope** (physical presence,
  credentials, executing untrusted code, moving funds), and **ambiguous**
  (placeholder or too-thin descriptions).
- **LLM robustness:** retries 429/5xx with jittered backoff, honours
  `Retry-After`, refuses to retry a 4xx that will not fix itself, and falls
  back to the deterministic heuristic on timeout, transport error, malformed
  envelope, unparseable JSON, or an implausible estimate that clamping would
  otherwise hide. **A failed LLM call never blocks scanning** (asserted by test).

### Week 3 — second marketplace and calibration
- execution.market connector, read-only against live data. Public endpoints
  need no auth; a test asserts **no `Authorization` header is ever sent**. All
  write paths raise `UnsupportedOperation`; `can_claim()` returns `False` for
  every task, naming the real reason.
- Calibration layer: predicted `p_success` vs. actual per attempt — Brier
  score, signed bias, reliability bands, acceptance rate, P&L, sliced by
  category and marketplace. Simulated outcomes are separable throughout.
  Measured bias feeds back via `adjustment_for()`, which stays at 1.0 below 5
  samples and is clamped to `[0.5, 1.5]` so one bad run cannot swing scoring.
- Dashboard gains **Calibration** and **Marketplaces** tabs; CLI gains
  `calibrate` and `markets`.
- Eight demo screenshots in `docs/screenshots/`.

---

## 3. Real vs. simulated — read this before trusting any number

| Real | Simulated |
|---|---|
| OpenTask + execution.market discovery (live public APIs) | **All settlement** — MockMarketplace only |
| Live bounty data: payouts, deadlines, categories | Every ledger entry (`simulated=True`) |
| Scoring, skip-filter, safety screening, validation | All P&L shown on the dashboard |
| The LangGraph gate, checkpointing, audit trail | All calibration outcomes to date |
| RiskGuard limits and circuit breaker | Deliverables (stubs — no LLM key present) |

Three things to be precise about:

1. **No money has ever moved**, real or testnet. There is no wallet.
2. **`arbiter calibrate --real-only` reports zero outcomes.** That is correct
   and should stay zero until a real marketplace is actually worked. Keeping
   that number honest is the point of the flag.
3. **Every deliverable produced so far is a stub**, because no Groq API key
   was ever present in `.env` (see §5). Stubs are labelled `simulated` and
   cannot be marked submittable — verified on a real run.

---

## 4. Known marketplace constraints

Verified against live APIs on 2026-08-23. Full write-ups in
`docs/verification-2026-08-23.md` and
`docs/verification-execution-market-testnet.md`.

| Marketplace | Claim model | Settlement | Status here |
|---|---|---|---|
| **OpenTask** | bid (`executionMode: "pitch"`) | off-platform, non-custodial | **Discovery only** |
| **execution.market** | open pull-claim | x402r escrow — **Base mainnet only** | **Discovery only** |
| **MockMarketplace** | open pull-claim | simulated | **The only paid loop** |

### OpenTask — no escrow at all
Their terms state OpenTask "does not custody funds, hold escrow, control
private keys, or sign wallet transactions for you." Settlement happens
off-platform between buyer and seller. Every live task uses
`executionMode: "pitch"` — bid, buyer selects — so there is no open claim.
Discovery endpoints (`GET /api/tasks`, `/api/tasks/{id}`) answer
unauthenticated.

### execution.market — real escrow, but mainnet only
The docs were misleading in *both* directions, so this was settled against the
live API:

- `GET /api/v1/x402/networks` advertises `base-sepolia` and six other
  testnets, which reads like a yes. **It is not.**
- `GET /api/v1/escrow/config` returns `chain_id: 8453` (Base **mainnet**) with
  mainnet USDC `0x8335…2913` and a single deployed escrow address. There is no
  network parameter and no testnet deployment.
- `GET /api/v1/x402/info` shows **multiple mainnets enabled, zero testnets**. The
  testnets in `all_known_networks` are known to the bundled SDK, not enabled
  on this deployment.

Sampling 50 live tasks reconfirmed this from task data rather than config
alone: every task settles on arbitrum, optimism, avalanche, or ethereum.

Additional constraints: acceptance requires **EIP-3009 signing** and clears a
per-task **`min_reputation`** gate. Open bounties observed were **$0.02** —
below the $1.00 payout floor, so they currently skip on payout *before* the
capability check fires.

Two live regression tests guard this finding: they fail if escrow moves off
`chain_id: 8453` or any testnet becomes enabled.

### Category mapping caveat
execution.market's `code_execution` category is deliberately **not** mapped to
our `small_code` handler. It means running code, which this agent does not do.

---

## 5. Exact next recommended task

**Supply a local Groq key, rerun offline evaluation, and human-grade the
artifacts without submission.** The workflow now exists and is isolated; the
key is the only missing input for non-stub generation.

```bash
# Put ARBITER_GROQ_API_KEY only in gitignored .env, then:
uv run arbiter estimate-check --market opentask --limit 4
uv run arbiter evaluate --marketplace opentask --limit 10
uv run streamlit run src/arbiter/dashboard.py
uv run arbiter export-evaluations --format csv
```

Review artifacts in the **Evaluation Review** tab. The result is human offline
quality evidence, not acceptance rate or marketplace success. Do not move it
into `outcomes` or calibration.

After enough reviewed samples, improve category classification and validators
from the observed error patterns. Financial, wallet, payment, escrow, signing,
and marketplace write paths remain out of scope without a separate explicit
authorization.

---

## 6. Safety boundaries — binding

**Do not write any of the following without separate, explicit approval from
the repository owner:**

- wallet code of any kind;
- Coinbase CDP SDK integration;
- x402 transaction construction, signing, or settlement;
- escrow interaction (deposit, release, refund, reclaim);
- private-key handling, key generation, mnemonics, or seed phrases;
- transaction signing (including EIP-3009 authorizations);
- **any** mainnet code path.

Additional standing rules:

- **Testnet-first.** Base Sepolia is the default for any wallet/payment action
  if and when that work is approved. Mainnet stays a separate, feature-flagged,
  human-gated path.
- **Never commit secrets.** All keys live in a gitignored `.env`.
  `.env.example` carries no values.
- **No real marketplace actions.** No OpenTask bids, no execution.market
  acceptance, no submissions to any live market. Both real connectors raise
  `UnsupportedOperation` on every write path — keep it that way.
- **The human approval gate stays on** (`ARBITER_REQUIRE_APPROVAL=true`)
  through Weeks 1–3 and always for any mainnet action.
- **Never let a stub or unvalidated deliverable be marked submittable.** The
  invariant lives in `executors/validation.py::grade` and is covered by tests.
  If you change grading, keep the tests in `tests/test_validation.py` passing.
- If you hit a blocker (API access denied, undocumented behavior, unclear
  settlement model), **stop and ask** rather than guessing or silently mocking
  around it.

---

## 7. Setup from a fresh machine

Verified end to end on a clean clone at commit `304fdee`.

```bash
# clone
git clone https://github.com/daniel-st3/agentarb.git
cd agentarb

# checkout the working branch
git checkout claude/verify-bounty-api-facts-f6ccdu

# install (creates .venv from uv.lock; needs uv and Python >=3.11)
uv sync --extra dev

# create .env — works as-is, no keys required
cp .env.example .env

# run tests
uv run pytest                 # 262 tests
uv run pytest -m live         # 3 network tests, opt-in

# scan the live marketplaces
uv run arbiter scan --limit 12
uv run arbiter markets
uv run arbiter calibrate --real-only

# local-only quality evidence; public discovery, never submitted
uv run arbiter evaluate --marketplace opentask --limit 10
uv run arbiter export-evaluations --format csv

# the human-gated loop (mock only)
uv run arbiter run -m mock --top 2
uv run arbiter queue
uv run arbiter approve mock:mock-007

# dashboard
uv run streamlit run src/arbiter/dashboard.py
```

If `uv` is not installed: `curl -LsSf https://astral.sh/uv/install.sh | sh`.

### Environment caveat seen in the build sandbox
Some sandboxed egress proxies fail `httpx` requests to `opentask.ai` with a
transport-level `ConnectError` while `curl` to the same URL returns 200. This
is a proxy artifact, **not a code defect** — execution.market works fine
through the same client, and OpenTask worked reliably earlier in the same
session. If you see `! opentask: ConnectorError` in a scan, test with
`curl -sS "https://opentask.ai/api/tasks?limit=1"` before investigating the
connector. The scan degrades gracefully by design: one failing marketplace
never sinks a run.

---

## 8. Local-only files and secrets — nothing here was pushed

Everything below is gitignored and exists only on the machine that built this.
**Nothing is required to run the project** — a fresh clone plus
`cp .env.example .env` is fully functional.

| Path | What it is | Needed? |
|---|---|---|
| `.env` | Local config copied from `.env.example` | Recreate with `cp .env.example .env` |
| `data/arbiter.db` | SQLite audit trail: bounties, decisions, tasks, ledger, events, outcomes | No — recreated on first run |
| `data/arbiter-checkpoints.db` | LangGraph checkpoints (suspended claim gates) | No — recreated on first run |
| `data/evaluations.db` | Separate offline-evaluation artifacts and human quality reviews | No — recreated by `arbiter evaluate` |
| `data/evaluations.csv` | Local export of offline evaluations | No — recreated by `arbiter export-evaluations` |
| `.venv/` | Virtualenv | No — `uv sync --extra dev` |
| `.pytest_cache/`, `.ruff_cache/`, `__pycache__/` | Tool caches | No |

### Secrets

**There are no secrets to transfer. None were ever set.**

The `.env` on the build machine contains only non-secret configuration
(base URLs, thresholds, log level) identical to `.env.example`.
`ARBITER_GROQ_API_KEY` was **never populated** — it is empty. That is why
every deliverable produced so far is a stub.

### Environment variables

All are optional and have working defaults in `src/arbiter/config.py`. The
only one that changes behavior meaningfully:

| Variable | Default | Effect |
|---|---|---|
| `ARBITER_GROQ_API_KEY` | *(empty)* | **The one that matters.** Empty → deterministic heuristic estimator + stub deliverables. Set → real LLM. Provider is `auto`, so no other change is needed. |
| `ARBITER_LLM_PROVIDER` | `auto` | `auto` \| `groq` \| `heuristic` |
| `ARBITER_REQUIRE_APPROVAL` | `true` | Human claim gate. **Leave on.** |
| `ARBITER_EVALUATION_DB_PATH` | `data/evaluations.db` | Physically separate offline quality-evidence store |
| `ARBITER_DAILY_BUDGET_USD` | `5.0` | Gross daily spend cap |
| `ARBITER_MAX_LOSS_PER_DAY_USD` | `5.0` | Circuit-breaker threshold |
| `ARBITER_ENABLE_WALLET` | `false` | Placeholder only — **no wallet code exists** |

### Generated screenshots
`docs/screenshots/*.png` **are committed** (8 files, ~1.1 MB) with an index at
`docs/screenshots/README.md`. Regenerate by running the dashboard and
capturing manually; there is no scripted capture in the repo.

---

## 9. Repository layout

```
src/arbiter/
  config.py       pydantic-settings over .env
  logging.py      structlog (console or JSON)
  models.py       Bounty, Score, capabilities, DeliverableState + SQLite tables
  db.py           engine/session helpers (WAL; checkpoints in a separate file)
  connectors/
    base.py              the MarketplaceConnector Protocol
    opentask.py          read-only, live
    execution_market.py  read-only, live
    mock.py              local, deterministic — the only paid loop
  llm.py          estimator + completions: Groq or offline fallback
  scoring.py      skip-filter + formula + ranking
  risk.py         RiskGuard: spend caps + circuit breaker
  executors/
    handlers.py   research / summarization / small_code / data_lookup
    router.py     category -> handler; unknown declines honestly
    safety.py     refuses harmful / out-of-scope / ambiguous work
    validation.py grades output: simulated -> draft -> validated -> ready
  graph.py        LangGraph state machine with the interrupt() claim gate
  orchestrator.py start / resume / approval queue
  calibration.py  predicted p_success vs. actual; Brier, bias, adjustment
  evaluation.py   isolated GET-only evaluation, export, and human review
  pipeline.py     scan -> score -> rank -> record
  cli.py          scan · run · queue · approve · reject · calibrate · markets
  dashboard.py    Streamlit + approve/reject queue

docs/
  verification-2026-08-23.md                  OpenTask + package findings
  verification-execution-market-testnet.md    the mainnet-only finding
  screenshots/                                8 dashboard captures + index
```

### Commit history

```
607d1a5  Add HANDOFF.md and screenshot index          <- docs only
304fdee  Dashboard fixes and demo screenshots         <- last code change
39dcb4c  Week 3: execution.market discovery connector and calibration layer
ffaecc9  Real bounded deliverables, safety screening, and deliverable states
af91a41  Week 2: execution sub-agents, LangGraph claim gate, RiskGuard
571416a  Week 1: alert-only cross-marketplace bounty scanner and scorer
```
