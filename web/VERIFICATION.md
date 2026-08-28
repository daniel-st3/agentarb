# Public web milestone verification

Historical UI milestone record. The subsequent distributed-limiter configuration
and verification are documented in `ABUSE-PROTECTION.md`; the old no-secrets and
per-instance-only limitations below no longer describe production configuration.

Verified locally on 28 August 2026. No deployment or push was attempted.

## Results

| Gate | Result |
|---|---|
| Python hermetic suite, including Streamlit AppTests | 305 passed; 3 live tests deselected |
| Python public GET-only tests | 3 passed; 305 deselected |
| Golden corpus v1 | 40/40 correct decisions; routing, validation and reason agreement 100%; unsafe false-allow rate 0% |
| Python-to-TypeScript source snapshot | Current; 184 hosted-policy parity cases |
| Web Vitest | 213 passed in 5 files |
| Playwright production browser suite | 13 passed, desktop and mobile |
| ESLint, TypeScript, Ruff | Passed |
| Next.js production build | Passed; two dynamic API routes and static product page |
| Production dependency audit | No known vulnerabilities |

The Python suite retains an existing Starlette/httpx deprecation warning.
Playwright emits a terminal color-environment warning; no application console
errors or hydration errors were observed by the browser tests.

## Architecture and change inventory

- `web/src/app`: standalone Next.js page, light editorial tokens, metadata,
  fixed GET discovery and validated non-persistent POST evaluation routes.
- `web/src/components`: responsive narrative, policy console, source evidence,
  decision filters, and accessible read-only contract dialog.
- `web/src/lib`: strict schemas, fixed-source normalization, Python-derived
  deterministic evaluator, bounded parsing, and in-memory cooldown.
- `web/src/**/*.test.ts`, `web/tests`, and test configuration: public boundaries,
  policy parity, responsive interaction, reduced motion, and screenshots.
- `scripts/export_web_contract.py`: build-time source/parity drift check;
  no Python subprocess or worker is present in the hosted runtime.
- `web/DESIGN.md`, `web/README.md`, root README/HANDOFF, and screenshot index:
  design audit, exact safety contract, local commands and deployment preparation.
- Existing Python application code, data stores, and worker code are unchanged.

## Fresh public evidence

The actual production-browser evaluation returned five OpenTask listings and an
empty successful execution.market response. The OpenTask listings were refused
before estimation because their supplied descriptions were insufficient for a
bounded task specification. Six explicitly controlled fixtures were evaluated
separately. No marketplace write, provider call, approval, worker, ledger, or
persistent visitor operation occurred.

Screenshots are indexed in `../docs/screenshots/web/README.md`. Hermetic captures
and actual public snapshots are explicitly distinguished. Responsive checks cover
1440, 1024, 768 and 390 pixels. Tests cover modal focus containment/restoration,
Escape, mobile navigation, fresh-session reset, and reduced motion.
Visual review caught and corrected stale mobile scroll-trigger positions after
panel changes. Section text now stays visible throughout scroll motion, and the
browser suite asserts safety-header and safety-item opacity explicitly.

## Deployment gates and limits

The application builds for Vercel, but it has not been deployed or verified on
Vercel infrastructure. Use root `web`, Next.js, Node 22.13+, pnpm 11.19, and
`pnpm build`. No application secrets or additional services are required.

Manual review must precede deployment: push the reviewed commit yourself, import
the existing branch, review hosting quotas and edge/firewall rate limiting, and
verify public-source availability in the actual deployment region.

The 30-second cooldown covers normal browser sessions and a single function
instance, not adversarial UUID rotation or distributed cold starts. Global abuse
protection is a deployment gate, not a claim made by this implementation. No
durable limiter or paid service was added. Public sources can fail; controlled
fallback remains available and never masquerades as live data.

The deterministic regex safety screen is not a universal semantic classifier.
Safety also relies on the structural absence of any external action capability.
Policy and preview data exist only in React memory; server memory retains only
short-lived anonymous cooldown timestamps. Fonts are downloaded during build and
self-hosted at runtime. The static proof strip is dated offline test evidence,
not a marketplace performance claim.
