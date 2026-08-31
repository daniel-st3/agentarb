# Arbitrage Intelligence verification

Verified locally on 2026-08-31 against the feature branch `codex/agent-arbitrage-underwriter`. Production remains on the approved baseline; this increment is Preview-only.

## Gates

| Gate | Result |
| --- | --- |
| SignalForge ESLint / TypeScript | Passed |
| SignalForge Vitest | 275 tests / 14 files passed |
| Production build | Passed; 41 generated route entries |
| Client boundary scan | 28 chunks passed; no server-only framing identifiers |
| Playwright | 70 passed, 10 intentional viewport-specific skips |
| Runtime preflight | Groq structured frame valid; durable cache write/read/delete, shared snapshot metadata and counters passed |
| npm audit | 0 vulnerabilities |
| Archived Python | 305 passed, 3 live tests deselected; Ruff passed |
| Golden corpus | 40/40 routing, decisions, validation and reasons; 0 unsafe false-allows |
| Archived web | 253 tests passed, including parity coverage |

Live catalog GET checks occur through the existing bounded connectors/runtime checks, not the archived marketplace live tests. No marketplace participation was tested or enabled.

The browser suite covers EN/ES/FR, keyboard Radar selection, 320/360/375/390/430/768px narrow layouts, existing laptop/desktop layouts, reduced motion, no-JavaScript narrative, route compatibility, policy changes, receipt download and safe REST/MCP calls. One existing preview-label assertion was made transition-aware: Motion can retain an exiting label for one render even with zero-duration transitions.

## Local HTTP checks

English, Spanish and French pages, OpenAPI, Agent Card, network status, observed/Lab searches and v2 evaluation returned HTTP 200. MCP initialize, tools/list and evaluation succeeded. The five listed tools remain discovery/planning/evaluation only. The controlled $1.20 scenario returned a 45-cent expected cost and 75-cent conditional spread with `execution_not_enabled`.

The configured cache contained 75 public supply observations during verification. Counts are time-dependent, source-bounded samples—not total market size. There were zero connected observed paid tasks and seven explicitly simulated Lab tasks.

## Performance and evidence limits

Global report-fixture hydration was removed. Network server first paint reads existing cached metadata and emits a bounded 20-row sample before protected refresh; it does not issue an unmetered source refresh. This improves first-paint usefulness and removes irrelevant report payloads. No blanket percentage payload or Lighthouse improvement is claimed.

Screenshots are produced by Playwright under `apps/signalforge/test-results/screenshots/*arbitrage*.png`. Hermetic screenshots correctly show zero live observations; configured-runtime browser checks separately confirm cached public supply. Observed mode screenshots show the honest empty demand state, not a fabricated observed task.

No production settings, secrets, marketplace permissions or execution paths were changed. Secret scanning is repeated before push across the full feature diff, including already committed domain changes. Deployment status and the immutable Preview URL are reported separately after Vercel completes the feature-branch build.
