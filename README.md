# SignalForge

**Know if an AI task is worth running.** SignalForge maps the capabilities a task needs, checks observed AI-service supply, prices known costs and explicit assumptions, and returns an auditable economic decision. It is an underwriter, not an autonomous marketplace agent.

**Use the live product:** [SignalForge](https://signalforge-rose-two.vercel.app/en) · [Español](https://signalforge-rose-two.vercel.app/es) · [Français](https://signalforge-rose-two.vercel.app/fr)

## What you can do

| Surface | Current behavior |
| --- | --- |
| [Forge](https://signalforge-rose-two.vercel.app/en/forge) | Bring your own objective, constraints, budget and economic assumptions. Get server-authoritative capability/route evidence, a conditional decision or explicit blockers, and a downloadable receipt. No account required. |
| [Market](https://signalforge-rose-two.vercel.app/en/opportunities) and [Network](https://signalforge-rose-two.vercel.app/en/network) | Inspect bounded, read-only observations. Agent Bounties supplies paid-work observations when qualifying inventory exists; service catalogs are supply context, not executable task quotes. Empty and unavailable states remain honest. |
| Bounded source synthesis in Forge | After a separate **Run task** action, fetch 1–10 user-supplied public HTTPS pages and make one bounded Groq synthesis call with source links. This is the only enabled execution route. It does not call discovered services or act on a marketplace. |
| Accounts | Optional email sign-in adds private saved analyses and execution history. Guests retain full underwriting results and receipt downloads. Saved snapshots reopen without rerunning work. |
| [Developer interfaces](https://signalforge-rose-two.vercel.app/en/developers/try) | REST, read-only MCP tools and A2A-style discovery metadata expose routing and underwriting evidence to other agents. |

The economic path is **objective → required capabilities → observed supply and route evidence → costs and risk → conditional decision → receipt**. Observed rewards, published model prices, market FX observations, user assumptions and unknown values keep distinct provenance. A missing payout, cost or eligibility signal never becomes zero or a favorable guess. A receipt hash is a SHA-256 fingerprint, not a digital signature.

## Try it in a minute

1. Open [Forge](https://signalforge-rose-two.vercel.app/en/forge) and describe a task. Add only economic inputs you actually know; leave other values unknown.
2. Select **Underwrite task**. Inspect the capability coverage, route limitations, decision and downloadable receipt. Underwriting does **not** perform the task.
3. For the supported research/synthesis route, optionally provide public HTTPS source URLs, review the displayed spend ceiling and select **Run task**. This is an explicit, separate action; its receipt distinguishes measured token usage from a provider charge that may remain unknown.
4. Sign in only if you want the result saved to **My analyses**.

[Pricing](https://signalforge-rose-two.vercel.app/en/pricing) shows Free at $0. Pro ($29/month) and Builder ($99/month) are **coming soon**; there is no checkout or billing integration.

## Safety boundaries

- Underwriting, claim-readiness and marketplace route contracts remain `execution_not_enabled`. SignalForge does not claim, bid, submit, fund, pay, sign, use wallets or execute discovered catalog services.
- The separate source-synthesis route requires an explicit user action, accepts only bounded public HTTPS sources, blocks private/internal network targets and redirects, and caps authorized model spend at **$0.01 per run**. Source links provide structural citation evidence, not independent fact verification.
- Public API quotas and catalog caches use shared Upstash infrastructure on Vercel. Missing durable protection fails closed. Optional accounts use Supabase Auth and owner-scoped row-level security; guest analysis does not require persistence.
- Marketplace text and fetched page text are untrusted data. They cannot change policy, network destinations, model access or execution permissions.

See [security boundaries](docs/security.md), [privacy](https://signalforge-rose-two.vercel.app/en/privacy), [real-data economics](docs/real-data-v1.md) and [source assessments](docs/live-sources.md).

## API and agent integration

```bash
curl --fail-with-body https://signalforge-rose-two.vercel.app/api/v1/network/status
curl --fail-with-body 'https://signalforge-rose-two.vercel.app/api/v1/opportunities?mode=observed&limit=20'
```

The first response reports source health, shared-cache/distributed-limit mode and the execution boundary. The second may legitimately return zero opportunities. Do not fabricate an ID for evaluation: use a currently returned record. [OpenAPI](https://signalforge-rose-two.vercel.app/api/v1/openapi) documents request schemas; [MCP](docs/mcp.md) and the [external client example](apps/signalforge/examples/client-agent/README.md) show how another agent consumes read-only contracts. The [Agent Card](https://signalforge-rose-two.vercel.app/.well-known/agent-card.json) is discovery metadata, not a claim or execution endpoint.

## Run locally

The deployed application is `apps/signalforge` (Next.js/TypeScript); use Node **22.13+**. The repository name `agentarb` and the root `src/arbiter*` Python packages reflect an earlier prototype, not another live SignalForge app. `web/` is a legacy frontend.

```bash
cd apps/signalforge
npm ci
npm run dev -- --port 3001
```

Open `http://127.0.0.1:3001/en`. Copy variable **names** from [`apps/signalforge/.env.example`](apps/signalforge/.env.example); keep values in an ignored local file or the appropriate Vercel environment. Never put server credentials in `NEXT_PUBLIC_` variables. Local development can use the deterministic decomposition fallback; hosted public APIs require durable cache and distributed rate-limit configuration. Source synthesis requires a server-side Groq key. Supabase public URL/publishable key are needed only for account features.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e -- --workers=2
npm run test:real-ui
npm audit
```

For implementation details, start with the [application guide](apps/signalforge/README.md), [API reference](docs/api.md), [localization guide](docs/i18n.md) and [contributor guide](AGENTS.md).
