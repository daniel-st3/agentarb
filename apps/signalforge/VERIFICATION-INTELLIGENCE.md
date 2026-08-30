# Agent routing and live intelligence — verification

Date: 2026-08-30. This record describes the tested source tree before its production push; deployment identity is reported separately.

## Gates

- ESLint: pass.
- TypeScript / Next route type generation: pass.
- SignalForge Vitest: **146 passed**, seven files.
- Production Next.js build: pass; 20 generated static pages/route artifacts.
- Client boundary scan: **19 static JavaScript files**, no server-only key identifiers or model endpoint code.
- Playwright: **33 passed, 9 intentionally skipped**, desktop/mobile, 42 project cases.
  Skips avoid duplicate width/no-JavaScript checks and inapplicable pinned/mobile scenarios.
- Dependency audit: **0 vulnerabilities**.
- Archived web/parity suite: **253 passed**.
- Archived Python hermetic suite: **305 passed, 3 live tests deselected**.
- Python Ruff: pass.
- Golden corpus: **40/40** decisions, routing, reasons and validation agreement;
  unsafe false-allow and safe false-refusal rates both zero.
- Targeted changed-file and Git-diff credential-pattern scan: no matches.
  Real environment files were not read. Only .env.example is tracked.

## Browser and live-source evidence

Local production UI observed **28 active MCP Registry records** and **11 APIs.guru
catalog entries** at 2026-08-30T18:37:08.680Z. Prior observations were also served
as cached_live with unchanged timestamps. Counts are bounded samples, not market
totals, provider availability checks or endorsements.

Browser checks cover objective → decomposition → deterministic contract, partial
zero-budget routes, JSON export, archive/session reset, separate simulated report,
network filters, task evaluation, capability handoff, API/MCP HTTP, no-JavaScript
readability, reduced motion, pinned desktop GSAP and staged mobile layout.
Viewport geometry passes at 390, 768, 1024 and 1440 pixels. A source/access-label
  wrapping defect at 390px was found and fixed before the final passing run.

The first production build compiled successfully but the post-build safety scan
expected the local .next chunk path. The scan now supports Next immutable/static
and Vercel Build Output layouts without bypassing the check; five fixture tests
cover relocated output, missing assets and server-identifier detection.

Fresh screenshots include hero, decomposition, route competition/contract,
mid-scroll route, simulated evidence, archive, network/evaluation, mobile and
reduced-motion states. Test screenshot names distinguish desktop/mobile and
width; offline test network screenshots show controlled fixtures, never fake live.

## Security and limitations

Only two fixed catalog GETs are enabled; no listed endpoint is invoked.
Unit fixtures test no redirects, caller headers/cookies/body forwarding,
unbounded responses, arbitrary destinations or connector action tools. Cache
freshness, hourly leases, stale cutoff, circuit breaker, public quotas, safe
errors, Zod schemas and MCP dispatch boundaries are covered.

Shared Upstash paths are tested with mocked infrastructure, including timeouts,
invalid quota decisions and exception redaction. No store was provisioned or
real Redis connectivity claimed. Without shared credentials, memory quotas and
cache are explicitly non-durable and per-instance. Configure shared storage
before high-volume aggregation.

No current task-marketplace source passed the redistribution gate; archived live
marketplace tests were deliberately not run. Task examples are fictional.
Groq success must be checked from a production response; tests use synthetic
provider output and no secret. Optional model inference is not task-service
execution, free research, or evidence verification.

A2A card is discovery-only, not an implemented A2A message/task transport.
MCP is real stateless Streamable HTTP JSON mode, not stdio-only or legacy SSE.
Every route is execution_not_enabled, with no payments or external task actions.
