# SignalForge — deployed application

Agent-routing intelligence: objectives → budget-constrained execution route contracts.

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
