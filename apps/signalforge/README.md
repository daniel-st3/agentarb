# SignalForge — deployed application

Arbitrage intelligence: paid opportunity → capability routes → deterministic economic decision. This branch is preview-only; production is not promoted.

Start with `/en/opportunities` for observed Agent Bounties records and exact source economics. EN/ES/FR are supported. Empty or ineligible demand is never replaced with fixtures. Historical Lab examples require explicit `ENABLE_DEMO_DATA=true` outside Vercel Production.

Versioned underwriting: `POST /api/v1/opportunities/evaluate` with a real returned opportunity ID and `responseVersion:"2.0"`. Omitting the version preserves the old conservative response. Discovery: `GET /api/v1/opportunities?mode=observed`. [Real-data economics, security and limitations](../../docs/real-data-v1.md).

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

Every route: `execution_not_enabled`. Live catalog options are informational, not executable steps. No payments, task-service execution, marketplace writes or visitor database. [Safety](../../docs/security.md) · [GSAP/Motion ownership](../../docs/interaction-system.md).
