# execution.market testnet support — resolved 2026-08-23

> **Re-verified 2026-08-26:** public GET requests still returned
> `escrow/config.chain_id: 8453`, default network `base`, multiple enabled
> mainnets, and zero enabled testnets. The discovery-only decision remains
> unchanged. The exact enabled-mainnet list is treated as live data rather than
> a hard-coded count.

**Question:** does execution.market's escrow support Base Sepolia, or is it
mainnet-only? This decides whether execution.market can join the testnet-first
paid loop.

**Answer: the escrow is Base mainnet only. There is no testnet escrow.**

Therefore execution.market **cannot** be part of a testnet-first paid loop.
MockMarketplace (simulated settlement) carries the Week 2 paid-loop demo, and
execution.market becomes a later, mainnet-adjacent integration.

## How this was established

The documentation site was misleading in *both* directions, so this was
settled against the live API rather than the docs.

The docs page lists only production chains and never mentions testnets, which
suggests mainnet-only. But the live OpenAPI spec
(`https://api.execution.market/openapi.json`, 339KB) describes
`GET /api/v1/x402/networks` as returning "all supported mainnet **and
testnet** networks", and that endpoint does list testnets:

```json
{
  "facilitator": "https://facilitator.ultravioletadao.xyz",
  "mainnets": ["ethereum", "base", "polygon", "optimism", "arbitrum", ...],
  "testnets": ["sepolia", "base-sepolia", "polygon-amoy",
               "optimism-sepolia", "arbitrum-sepolia",
               "avalanche-fuji", "bsc-testnet"]
}
```

Taken alone that reads like a yes. It is not. Two further live endpoints show
the testnets are known to the payment SDK but not enabled on this deployment,
and — decisively — that the escrow contract itself is pinned to Base mainnet.

`GET /api/v1/escrow/config` (the contract that actually holds bounty funds):

```json
{
  "available": true,
  "network": "base",
  "chain_id": 8453,
  "escrow_address": "0xb9488351E48b23D798f24e8174514F28B741Eb4f",
  "usdc_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
}
```

- `chain_id: 8453` is Base **mainnet** (Base Sepolia is 84532).
- `0x8335...2913` is canonical **Base mainnet** USDC (Base Sepolia USDC is
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`).
- The response exposes a single deployed escrow address — there is no
  network parameter and no testnet deployment to point at.

`GET /api/v1/x402/info` confirms the same split:

```json
{
  "enabled_networks":    ["arbitrum", "avalanche", "base", "celo", "ethereum",
                          "monad", "optimism", "polygon", "skale", "solana"],
  "all_known_networks":  ["arbitrum", "arbitrum-sepolia", "base",
                          "base-sepolia", "ethereum-sepolia", ...],
  "default_network": "base"
}
```

`all_known_networks` is what the bundled x402 SDK (v0.64.0) can address;
`enabled_networks` is what this deployment actually accepts — **ten mainnets,
zero testnets**. The `/x402/networks` testnet list describes the upstream
Ultravioleta facilitator's capability, not execution.market's own enablement.

## Consequence for the build

- **Week 2 paid-loop demo runs on MockMarketplace**, whose settlement is
  explicitly `Settlement.SIMULATED`. No real or testnet funds move.
- **execution.market is deferred.** Integrating it for a *paid* loop means
  mainnet USDC on Base — which collides with the testnet-first rule and falls
  under the Week 4 human-gated real-money path, not Week 2/3.
- A **read-only execution.market connector remains viable at any time** and
  keeps the cross-marketplace router story intact: it can list and score real
  bounties (`supports_open_claim=True`, `settlement=ONCHAIN`) without ever
  touching the escrow. Recommended for Week 3 as discovery + scoring only.
- The earlier reputation-gate caveat still stands and matters more now: even
  on mainnet, `em_accept_agent_task` enforces a minimum-reputation gate a new
  agent may not clear.

## Sources

- `https://api.execution.market/openapi.json` (live spec, OpenAPI 3.1.0)
- `https://api.execution.market/api/v1/escrow/config` (live)
- `https://api.execution.market/api/v1/x402/info` (live)
- `https://api.execution.market/api/v1/x402/networks` (live)
- https://docs.execution.market/

---

## Addendum — Week 3 connector build (2026-08-23)

The read-only connector is built and running against live data. Endpoints
verified, all unauthenticated:

| Endpoint | Response |
|---|---|
| `GET /api/v1/tasks/available?limit=` | `{"tasks":[...], "count", "offset"}` — open tasks |
| `GET /api/v1/tasks?limit=` | same shape, all statuses |
| `GET /api/v1/tasks/{id}` | the task object, **unwrapped** (unlike OpenTask) |

A live task carries `bounty_usd`, `payment_token`, `payment_network`,
`min_reputation`, `required_capabilities`, `status`, `deadline`, and an
`evidence_schema`. Sampling 50 live tasks:

- **Networks:** arbitrum (31), optimism (13), avalanche (3), ethereum (3) —
  every one a mainnet, reconfirming the finding above from live task data
  rather than only from config.
- **Categories:** data_collection (32), knowledge_access (16),
  api_integration (1), verification (1).
- **Statuses:** completed (25), accepted (18), submitted (3), assigning (2),
  published (2) — a real, active market, but only a couple open at a time.
- **Bounties are small:** open tasks were $0.02 each.

### Category mapping

Their taxonomy has 21 categories; six map onto our handlers:

| execution.market | ours |
|---|---|
| `research`, `knowledge_access` | research |
| `data_collection`, `data_processing` | data_lookup |
| `content_generation` | summarization |
| `api_integration` | small_code |

Everything else maps to `UNKNOWN` and is declined — including
**`code_execution`**, which is deliberately *not* mapped to `small_code`: it
means running code, which this agent does not do.

### What the connector does and does not do

`can_claim()` returns `False` for every task, naming the real reason (mainnet
network, EIP-3009 signing, and `min_reputation` when non-zero).
`claim`/`submit`/`settlement_status` all raise `UnsupportedOperation`. A test
asserts no `Authorization` header is ever sent — we hold no credentials for
this marketplace.

Two live tests guard the finding itself: if `escrow/config` ever moves off
`chain_id: 8453`, or any testnet appears in `x402/info`'s `enabled_networks`,
they fail and tell us to revisit the paid-loop decision.
