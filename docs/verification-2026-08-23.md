# Pre-build fact check — 2026-08-23

Verified against live sources before Week 1. Each item is marked
**CONFIRMED**, **CHANGED** (plan assumption was wrong or stale), or **UNCLEAR**.

---

## 1. OpenTask settlement — **CHANGED (decided: discovery-only)**

The plan listed this as "off-platform in v1 (survey says USDC escrow — verify
first)". It is off-platform, and not ambiguously so.

OpenTask's terms state it "does not custody funds, hold escrow, control
private keys, or sign wallet transactions for you", and describe the router
payment flow as **non-custodial**. It "may create signed payment payloads,
verify matching blockchain events, maintain payment artifacts, and calculate
platform fees" — but the money moves buyer→seller directly. It also "cannot
automatically reverse direct router settlement or force an external wallet
refund."

Two further constraints found in the live API rather than the docs:

- Every task returned on 2026-08-23 carries `executionMode: "pitch"` — you win
  work by submitting a bid the buyer selects. There is **no open pull-claim**.
- Budgets are frequently unstructured: `budgetAmount`/`budgetCurrency` are
  often `null` with a free-form `budgetText` such as `"From 15 USDC (fixed
  scope, quoted before start)"`.

**Consequence:** OpenTask cannot be part of a paid claim→execute→settle loop.
This is exactly the fallback the plan anticipated (§6), so it needed no
decision from you: OpenTask is wired as **discovery-only**, and the paid loop
will run on MockMarketplace (simulated) plus execution.market. The connector
declares `supports_open_claim=False`, `settlement=OFFPLATFORM`, and raises
`UnsupportedOperation` from `claim`/`submit`/`settlement_status`.

### API, verified live (both endpoints answer unauthenticated)

| Endpoint | Response |
|---|---|
| `GET https://opentask.ai/api/tasks?limit=&cursor=` | `{"tasks": [...], "nextCursor": str\|null}` |
| `GET https://opentask.ai/api/tasks/{id}` | `{"task": {...}}` — includes the full `description` |

Authenticated `/api/agent/*` routes (register, bid, contracts, submissions)
need a bearer token from `POST /api/agent/register` and use scopes like
`tasks:read`. Not needed for Week 1; not implemented.

---

## 2. execution.market — **CONFIRMED, with more capability than assumed**

Still x402-native, still on Base, and the claim model is what the plan
assumed (browse → accept → submit evidence → approve → paid).

- **Settlement:** `x402r AuthCaptureEscrow` locks the bounty at assignment and
  splits atomically at release (87% executor / 13% platform). This is real
  platform escrow — unlike OpenTask.
- **Auth:** EIP-3009 signatures; the facilitator pays gas (gasless for us).
- **Chains:** broader than the plan's "Base" — Base, Ethereum, Polygon,
  Arbitrum, Avalanche, Optimism, Celo, Monad, SKALE, Solana.
- **Stablecoins:** USDC, EURC, PYUSD, AUSD, USDT.
- **Surface:** ~105 REST endpoints (Swagger at `api.execution.market/docs`)
  plus an MCP server (~36 tools, e.g. `em_publish_task`,
  `em_accept_agent_task`, `em_approve_submission`).

**One caveat for Week 3:** `em_accept_agent_task` enforces capability matching
and a **minimum-reputation gate**. A brand-new agent may be unable to accept
higher-value tasks until it has a track record. Worth probing early in Week 3
rather than discovering it at demo time.

**Still unclear:** whether Base *Sepolia* is supported for escrow, or whether
escrow is mainnet-only. That decides whether the testnet-first posture works
on execution.market or whether testnet stays confined to MockMarketplace. To
resolve at the start of Week 3 — it does not affect Week 1.

---

## 3. Package names and versions — **CHANGED (both stale in the plan)**

| Purpose | Package | Latest verified | Notes |
|---|---|---|---|
| x402 client | **`x402`** | **2.20.0** (2026-08-18) | Published by the x402 Foundation (maintainer `erik_cb`). Requires Python ≥3.10. Extras: `x402[httpx]` (async), `x402[requests]` (sync). |
| Coinbase CDP | **`cdp-sdk`** | **1.47.0** | Requires Python ≥3.10. Note the repo split: `coinbase/cdp-sdk` (current) vs. the older `coinbase/cdp-sdk-python` (0.x). |

The current `x402` API is not the shape the plan implies:

```python
from x402 import x402Client
from x402.mechanisms.evm.exact import ExactEvmScheme

client = x402Client()
client.register("eip155:*", ExactEvmScheme(signer=my_signer))
payload = await client.create_payment_payload(payment_required)
```

Watch out for near-name squatters on PyPI (`x402-python-client`, `tx402`,
`acedatacloud-x402`, `openlibx402`). The correct package is the bare `x402`.

**Not pinned yet, deliberately** — neither is a dependency at Week 1, and
per the plan they get pinned at the start of Week 2, against docs re-read at
that time. No wallet or payment code exists in this repo.

---

## 4. Not re-checked

"Agent Hansa" remains unverified and stays dropped. Daydreams TaskMarket and
Clustly are stretch goals and were not part of this check.

## Sources

- https://opentask.ai/docs, https://opentask.ai/terms
- `https://opentask.ai/api/tasks` and `/api/tasks/{id}` (live responses)
- https://docs.execution.market/
- https://pypi.org/project/x402/, https://pypi.org/project/cdp-sdk/
