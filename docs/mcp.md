# MCP and agent discoverability

## Real Streamable HTTP MCP

Endpoint: `https://signalforge-rose-two.vercel.app/api/mcp`

Uses the installed official `@modelcontextprotocol/sdk` server and Web Standard Streamable HTTP transport in stateless JSON-response mode. A fresh server/transport exists for each request and is closed afterward. SDK initialization and `tools/list` are covered by tests. No session database, SSE subscription, resumability, task execution, prompts, roots, sampling, elicitation or credential exchange is provided.

Reference: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports . Clients should negotiate a supported protocol version and send `Accept: application/json, text/event-stream`. GET returns 405 because standalone SSE is not offered. Invalid Origin returns 403; API clients without Origin are accepted. No legacy HTTP+SSE transport is claimed.

Use `apps/signalforge/mcp.json` or the equivalent client-specific remote MCP setting:

```json
{"mcpServers":{"signalforge":{"type":"http","url":"https://signalforge-rose-two.vercel.app/api/mcp"}}}
```

Client configuration shape varies; use your client's **remote Streamable HTTP** option, not a stdio command. No local bridge is required.

Tools:

- `signalforge_plan_route`: objective, context_url?, budget_usd, optimization_policy. Returns the same demo contract, source freshness and warnings as REST.
- `signalforge_search_catalog`: capability?, query?, listing_type?, max_price_usd?, freshness?, limit (1–50).
- `signalforge_get_listing`: id from the current bounded catalog.
- `signalforge_evaluate_opportunity`: opportunity_id from the catalog. No bid/claim/submit/settle behavior.

All tool inputs are strict Zod schemas. Descriptions are untrusted plain text. No arbitrary URL or credential field, payment tool or execution method is registered. MCP methods share the API service functions, quotas, cache, validation and safety boundaries.

## A2A-style discovery document

`https://signalforge-rose-two.vercel.app/.well-known/agent-card.json`

Uses A2A 1.0 vocabulary for identity, skills, input/output modes and capabilities: https://a2a-protocol.org/latest/definitions/ . **It is discoverability only, not a full A2A implementation.** `supportedInterfaces` is empty rather than falsely advertising a JSON-RPC/HTTP A2A message endpoint. `x-signalforge` identifies REST/MCP paths and the explicit limitation. There is no message/send, task lifecycle, streaming, push notification or execution interface.

`/llms.txt` explains these boundaries. `/robots.txt` allows public documentation and excludes operational APIs from crawling. No obsolete ai-plugin.json is added.
