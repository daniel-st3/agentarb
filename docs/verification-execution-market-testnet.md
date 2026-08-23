# execution.market testnet support — resolved 2026-08-23

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
