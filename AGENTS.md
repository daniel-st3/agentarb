# Repository Guidelines

## Project Structure & Module Organization

`apps/signalforge/` is the production Next.js application. App Router pages and route handlers live in `src/app`, reusable UI in `src/components`, and deterministic domain/server logic in `src/domain` and `src/server`. Its tests are under `apps/signalforge/tests`, with Playwright suites in `tests/e2e` and `tests/real-ui`; static assets belong in `public/`.

The original Python prototype remains in `src/arbiter` and `src/arbiter_worker`, with tests in root `tests/` and fixtures in `data/golden_tasks/`. `web/` is a legacy frontend: do not treat it as the deployed SignalForge app. Architecture, security, and deployment notes live in `docs/`.

## Build, Test, and Development Commands

Run frontend commands from `apps/signalforge` using Node 22.13+:

```bash
npm ci                         # install the locked dependency graph
npm run dev -- --port 3001     # start local Next.js development
npm run lint                   # ESLint checks
npm run typecheck              # Next type generation plus strict TypeScript
npm test                       # Vitest unit/security suite
npm run build                  # production build and client-boundary check
npm run test:e2e -- --workers=2
npm run test:real-ui
npm audit
```

For the archived Python system, install the `dev` extras, then run `ruff check .` and `pytest` from the repository root. Live-marked Python tests require explicit opt-in.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, semicolons, and existing ESLint rules. Name React components in `PascalCase`, functions/variables in `camelCase`, and modules in descriptive kebab-case. Keep Zod schemas beside their domain contracts. Python uses four spaces, `snake_case`, type hints, and Ruff’s 100-character line limit.

## Testing Guidelines

Name Vitest files `*.test.ts`, Playwright files `*.spec.ts`, and Python tests `test_*.py`. Add regression coverage for every policy, provenance, connector, or API change. Tests must remain hermetic unless explicitly marked live. Preserve `execution_not_enabled`, fail-closed behavior, and honest unknown states.

## Commit & Pull Request Guidelines

Use short imperative commits, such as `Harden observed underwriting` or `Add safe refresh diagnostics`. Keep commits focused. PRs should describe behavior and safety impact, list verification commands/results, link relevant issues, and include screenshots for visual changes. Never merge, deploy, or promote production unless explicitly requested.

## Security & Configuration

Copy variable names from `.env.example`; store values only in `.env.local` or Vercel. Never commit secrets or create `NEXT_PUBLIC_` variants of server credentials. Do not add marketplace writes, claims, payments, wallets, arbitrary URL fetching, or new execution paths without explicit authorization and a separate safety review. The existing bounded, user-authorized public-source synthesis route is the sole enabled execution path; underwriting contracts remain `execution_not_enabled`.

## SignalForge Production Baseline

Production branch: `claude/verify-bounty-api-facts-f6ccdu`.

Last verified product-release commit when this guide was updated: `245ce8ed74785503c751ea6d7ca59f8f3dc80c8b`. Verify the current branch head and Vercel deployment before release work; this reference is historical after later merges.

The V2 Profit Engine, Forge, guest-first accounts and bounded public-source synthesis are live. Keep Production stable; future experiments belong on dedicated branches and Preview deployments.

Never merge, deploy, promote, modify Production environment variables, or change Production aliases unless explicitly instructed.

## Product Identity

SignalForge is an economic operating system and underwriting layer for agent work.

It is **not**:

- a generic AI chatbot
- a prompt wrapper
- a marketplace listing page
- a generic SaaS dashboard
- an autonomous execution agent

Core product concepts include:

- observed paid work
- user-defined tasks
- fulfillment route competition
- true economic cost
- risk and uncertainty
- conditional profitability
- provenance
- verification
- auditable decisions
- eventual realized-outcome history

Unknown information must remain explicitly unknown. Never invent payout, eligibility, provider performance, settlement, source evidence, or economic certainty for visual effect.

## V2 Experience Direction

Visual direction: **financial instrument × editorial research lab × technical schematic**.

The application should feel authored, premium, technically serious, surprising, and recognizable without its logo.

Avoid generic AI/SaaS visual language, including:

- centered ChatGPT-style prompt boxes as the primary interface
- purple/blue AI gradients
- decorative glowing orbs
- excessive glassmorphism
- card grids without information hierarchy
- arbitrary pill-heavy UI
- generic dashboard templates
- meaningless 3D
- fade-up-on-scroll applied everywhere
- animation purely for decoration

Marketing surfaces may use strong negative space and expressive typography. Workstation surfaces may become information-dense, precise, and instrument-like. Mobile layouts must be intentionally designed rather than reduced desktop layouts.

## Typography

Typography is part of SignalForge's identity and may communicate economic state, certainty, risk, or decision status.

Do not default the full product to Inter, Geist, Space Grotesk, or another generic startup stack without explicit design justification.

Premium/commercial font candidates may be documented, but commercial font files must never be downloaded, scraped, redistributed, or committed without an explicit licensed asset supplied by the owner. Use legal open-source substitutes during prototyping when necessary.

Use tabular numerals for financial values where appropriate.

## Motion Doctrine

Every meaningful animation should communicate at least one of:

- causality
- route competition
- economic compression
- provenance
- state change
- uncertainty
- evidence accumulation
- decision thresholds

Preferred motion vocabulary:

- signal trace
- route drawing
- route elimination
- economic compression
- number transition
- evidence reveal
- decision morph / FLIP
- threshold crossing
- spatial competition

Preferred responsibilities:

- **GSAP:** cinematic sequences, ScrollTrigger storytelling, SplitText, SVG/path orchestration, timeline choreography, and complex FLIP transitions when appropriate
- **Motion:** ordinary React state transitions, layout transitions, shared-layout behavior, springs, and component interaction
- **React Three Fiber / Three.js:** only when spatial or data visualization genuinely benefits; never use decorative 3D simply to appear impressive

Native scrolling is required for product/workstation surfaces. Smooth-scroll tooling is permitted only for marketing/storytelling surfaces when it materially improves the experience.

Reduced-motion mode must preserve complete comprehension and usability.

## V2 Product Priorities

Near-term V2 concepts:

1. Profit Engine hero
2. Live Opportunity Radar
3. Forge Lab for user-defined tasks/prompts
4. Route Arena
5. economic waterfall
6. Profit Frontier
7. Signal Tests
8. auditable/shareable receipts
9. Strategy Engine
10. watches / opportunity alerts
11. historical market snapshots
12. eventual backtesting
13. eventual Agent Passport / measured outcome reputation

Do not prioritize Teams/admin collaboration features. Do not implement autonomous execution yet. Do not implement billing yet.

Future monetization architecture should remain compatible with Free, Pro, and Builder / API without requiring Stripe specifically.

## V2 Development Rules

Before implementing a new major experience:

1. inspect the existing implementation
2. document intended behavior
3. prototype in an isolated V2/lab surface when appropriate
4. review in Preview
5. test responsive behavior
6. test reduced motion
7. measure performance
8. only then integrate into primary routes

For significant visual work, do not redesign the entire application in one task. Prefer isolated, reviewable milestones and focused commits.

Do not install animation/design libraries merely because they are fashionable. Every dependency must have a named role in the architecture.

When instructed to produce multiple design concepts, keep them meaningfully different rather than superficial color variations.
