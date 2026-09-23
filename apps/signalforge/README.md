# SignalForge — deployed application

SignalForge underwrites AI-agent work before anything executes. Visitors can use Forge, inspect the full result, and download an underwriting receipt without an account. Accounts add private saved-run history.

Start with `/en/opportunities` for observed Agent Bounties records and exact source economics. EN/ES/FR are supported. Empty or ineligible demand is never replaced with fixtures. Historical Lab examples require explicit `ENABLE_DEMO_DATA=true` outside Vercel Production.

Versioned underwriting: `POST /api/v1/opportunities/evaluate` with a real returned opportunity ID and `responseVersion:"2.0"`. Omitting the version preserves the old conservative response. Discovery: `GET /api/v1/opportunities?mode=observed`. [Real-data economics, security and limitations](../../docs/real-data-v1.md).

Real Economics v1 preserves Agent Bounties USDC base units, combines them only with a fresh sourced USDC/USD observation, and prices an explicit bounded workload against a reviewed current Groq price record. Conditional profit, margin, risk-adjusted EV and break-even values appear only after the operator supplies every missing assumption. The v2 receipt fingerprints the full canonical economic decision core; claim readiness v1.1 reports expected/worst-case total cost, completeness, capital and bond exposure separately. The receipt separates observed, published, market, user-scenario, derived and unknown fields. `POST /api/v1/opportunities/claim-readiness` and MCP tool `signalforge_get_claim_readiness` are inspection-only: `claimAuthorized=false` and `executionStatus=execution_not_enabled`.

[Production](https://signalforge-rose-two.vercel.app/en) · [Root guide](../../README.md).

```bash
npm ci
npm run dev -- --port 3001
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit
npm start -- --port 3001
```

## External consumer proof

```bash
npm run demo:client-agent -- \
  --objective "Build a verified startup due-diligence route" \
  --budget 0.25 --policy most_verified --output ./route-receipt.json
npm run demo:client-agent -- --transport mcp --output ./mcp-receipt.json
npm run demo:client-agent -- --fixture unsafe-execution-enabled --output ./refusal-receipt.json
```

The last command intentionally exits 2. The client validates and records locally; it is not an executor. [Client guide](examples/client-agent/README.md).

Vercel root: `apps/signalforge`. Human routes use `/en`, `/es`, `/fr`; old links redirect to English. Protocol URLs remain stable. [i18n](../../docs/i18n.md).

No keys are needed for demo planning. Optional server-only Groq interprets objectives; Upstash supplies public-catalog cache and hashed shared limits. Use `.env.example` names, never `NEXT_PUBLIC_` credentials. [Setup](../../docs/durable-network.md).

Underwriting, claim-readiness, and marketplace contracts retain `execution_not_enabled`. Live catalog options are informational, not executable steps. A separate, explicitly authorized Forge route can read 1–10 supplied public HTTPS pages and synthesize their contents with a bounded Groq call. Its receipt reports source evidence, usage, calculated-at-published-price cost where available, and structural—not independent—citation verification. The fixed authorized provider ceiling is $0.01 per run; no marketplace claims, arbitrary tool calls, wallets, purchases, or payments are enabled. Signed-in execution receipts require the additive `source_synthesis_runs` migration with owner-only RLS; guest results remain downloadable without persistence. [Safety](../../docs/security.md) · [GSAP/Motion ownership](../../docs/interaction-system.md).
