# SignalForge application

This is the deployed Next.js app. Start with the [repository README](../../README.md) for the product tour and canonical Production link. The Vercel project root is `apps/signalforge`; `web/` is a separate legacy frontend.

## Local development

Use Node 22.13+ and the committed lockfile:

```bash
npm ci
npm run dev -- --port 3001
```

Open `http://127.0.0.1:3001/en`. Human pages also support `/es` and `/fr`; protocol URLs remain unprefixed. The guest Forge flow works without Supabase. Copy names from [`.env.example`](.env.example), but keep values private. Local deterministic decomposition works without Groq; source synthesis needs `GROQ_API_KEY`. Hosted public APIs fail closed without shared Redis and a rate-limit salt. Never place a server credential in a `NEXT_PUBLIC_` variable.

## Product and data boundaries

- `src/app/[locale]` contains Forge, Market, Network, Pricing, account/history and developer pages. Guests can underwrite and download receipts; authenticated users can save private snapshots. Saved records reopen without rerunning the task.
- `src/domain` owns deterministic contracts and economics. `src/server` owns source connectors, policy, shared caching, rate limits, Supabase-backed persistence and the bounded public-source fetch. UI code must not invent profit, route evidence or marketplace eligibility.
- Agent Bounties and catalog connectors are read-only. A zero-result observed market is valid. Reviewed Groq prices and fresh USDC/USD observations are distinct from user assumptions; unknown fields stay unknown.
- Underwriting and claim-readiness retain `execution_not_enabled`. The separate Forge **Run task** action can synthesize 1–10 supplied public HTTPS pages with one bounded Groq call and a $0.01 authorized model-spend ceiling. No marketplace claim, service execution, payment, wallet or arbitrary tool access is enabled. Citation links are structural evidence, not independent verification.
- Receipt SHA-256 values are fingerprints, not signatures. Guest receipts download locally; signed-in runs use owner-scoped Supabase row-level security.

## Interfaces and verification

Read [OpenAPI](https://signalforge-rose-two.vercel.app/api/v1/openapi) for exact REST schemas, [MCP guidance](../../docs/mcp.md) for read-only agent tools, and the [external client example](examples/client-agent/README.md) for a consumer that validates and records route contracts without executing them.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e -- --workers=2
npm run test:real-ui
npm audit
```

Keep live-source probes separate from hermetic tests. See [security](../../docs/security.md), [i18n](../../docs/i18n.md) and [real-data economics](../../docs/real-data-v1.md) before changing a policy, connector or economic formula.
