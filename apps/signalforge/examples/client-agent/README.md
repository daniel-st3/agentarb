# External Client Agent Demo

An independent Node/TypeScript process consumes deployed REST/MCP. It imports pure Zod/domain schemas, not the web app or server connectors; it never enters the browser bundle.

From `apps/signalforge`, run `npm ci`, then:

```bash
npm run demo:client-agent -- \
  --objective "Build a verified startup due-diligence route" \
  --budget 0.25 --policy most_verified \
  --endpoint https://signalforge-rose-two.vercel.app \
  --transport rest --output ./route-receipt.json
npm run demo:client-agent -- --transport mcp --output ./mcp-receipt.json
npm run demo:client-agent -- --fixture unsafe-execution-enabled --output ./refusal-receipt.json
```

Options: `--objective`, `--budget` (0–10 USD, whole cents), `--policy` (`best_value|cheapest|most_verified|fastest`), `--endpoint` (HTTPS origin or HTTP loopback), `--transport rest|mcp`, `--output`, `--fixture unsafe-execution-enabled`.

REST uses only `/api/v1/routes/plan`; MCP calls `signalforge_plan_route` at `/api/mcp`. No discovered server connection, redirects or credential forwarding. Response size and timeout are bounded.

## Validation and output

The client requires explicit wire boundaries before schema defaults. It checks schema, supplied budget, request/policy identity, planned/simulated status, complete critical coverage and verification. Missing source metadata, observations over 24 hours old or more than one minute in the future, and observed listings inserted into selected/fallback steps are refused.

```text
SIGNALFORGE CLIENT AGENT
────────────────────────────────────────
… objective, policy, modeled budget and actual response metadata …
Safety validation
 ✓ Hard budget honored
 ✓ No services called by this client
 ✓ No payments made by this client
 ✓ External execution disabled
 ✓ Route contract safety validation
Decision: ROUTE ACCEPTED FOR FUTURE SAFE EXECUTOR
Inspection only. This is not execution authorization.
```

Costs/counts come from the received contract, not this illustration. Partial routes are refused. Versioned receipts contain UUID, timestamp, request, endpoint, refusal codes and provenance. Files use exclusive `wx`, permissions `0600`; existing files are never overwritten. Default filename includes a UUID. Receipts contain your objective; review before sharing. They are ignored by Git and never uploaded.

Exit codes: **0** accepted for inspection; **2** refused (including unsafe fixture); **1** invalid arguments or inability to create a receipt. Network failures produce refusal receipts where writable. No provider call, payment, signing or marketplace action follows acceptance.
