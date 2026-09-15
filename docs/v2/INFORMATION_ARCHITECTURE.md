# SignalForge V2 Information Architecture

## Navigation principle

Navigation follows the operator’s decision flow: observe, model, decide, inspect. It avoids team administration, account chrome, and marketplace taxonomy.

### Primary navigation

```text
Radar        /[locale]/opportunities
Forge Lab    /[locale]/forge
Network      /[locale]/network
Strategies   /[locale]/strategies          future, gated until persistence exists
Developers   /[locale]/developers
```

“Archive” remains a session index until durable user history exists; rename it “Session receipts” before presenting it as historical performance. Privacy stays in the footer. Locale prefixes remain `/en`, `/es`, and `/fr`; machine routes remain stable and unlocalized.

## Route hierarchy

### Public marketing

- `/[locale]` — short Profit Engine homepage
- `/[locale]/how-it-works` — detailed observe → route → price → decide narrative
- `/[locale]/privacy` — data, infrastructure, and execution boundaries

### Public market intelligence

- `/[locale]/opportunities` — Live Opportunity Radar and underwriting inspector
- `/[locale]/opportunities/[id]` — recommended future canonical, shareable read-only opportunity view
- `/[locale]/network` — service/tool catalog explorer with source health

### Interactive lab

- `/[locale]/forge` — user-defined objective and constraints
- `/[locale]/forge/[id]/plan` — capability decomposition and Route Arena
- `/[locale]/forge/[id]` — route contract and receipt
- `/[locale]/lab/v2` — Preview-only visual laboratory; never linked in Production until accepted

The existing session-only IDs may continue during prototyping. A future shareable receipt needs an immutable server-generated identifier and explicit persistence policy.

### Strategy and personal workspace

- `/[locale]/strategies` — future named policies
- `/[locale]/watches` — future saved read-only market queries
- `/[locale]/history` — future market snapshots and receipt history
- `/[locale]/backtests/[id]` — eventual replay result

These routes should not ship as empty shells. Until persistence exists, keep the current `/history` semantics explicit and omit Strategies/Watches from primary navigation.

### Developer surfaces

- `/[locale]/developers` and `/[locale]/developers/try`
- `/api/v1/opportunities`, `/evaluate`, and `/claim-readiness`
- `/api/v1/catalog`, `/network/status`, `/routes/plan`, `/openapi`
- `/api/mcp`, `/.well-known/agent-card.json`, `/llms.txt`

Machine contracts remain English, versioned, read-only, and `execution_not_enabled`.

## Public access

Homepage, Radar, Network, Forge Lab, read-only receipts, developer documentation, REST, MCP, and A2A-style discovery should remain usable without signup. Rate limits and bounded inputs protect public access. Authentication is not introduced in V2 foundation work.

Future persistence creates a clear boundary: anonymous visitors may model and export locally; saving strategies, watches, or private receipts would eventually require identity and a documented retention model. Do not add authentication before one of those durable user values is proven.
