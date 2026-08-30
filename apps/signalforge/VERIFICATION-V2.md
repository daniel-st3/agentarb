# Visual V2 verification — 2026-08-30

## Scope

Presentation only. No diff in src/domain, src/server, src/app/api,
src/components/session.tsx, dependency manifests, or repository adapters.
The existing consent flow, safety/provenance contracts and exports are unchanged.
No push, deployment, external service execution, credential use or paid operation.

## Checks

- npm run lint: passed, zero errors/warnings.
- npm run typecheck: Next route generation and strict TypeScript passed.
- npm test: 65 tests, two files, passed.
- npm run build: Next 16.3.3 production build passed; same application routes.
- npm run test:e2e: 18 passed, 8 intentionally skipped duplicate/project-specific
  cases; zero failures. Production server, desktop and mobile.
- Browser tests cover request → plan → explicit Run → brief → evidence → exports,
  session reset, cheapest route, safe error/loading states, inaccessible routes,
  no external requests or console errors in the full workflow, and responsive
  geometry at 390/768/1024/1440px.
- New checks assert no enclosing hero/feature-card grid, a pinned scene whose
  viewport position stays constant while SVG path length changes, chapter and
  modeled-cost progression, a single-source → simulated-corroboration transition,
  matchMedia cleanup on reduced-motion changes, no pinning on mobile/short laptop
  windows, and a fully readable landing without JavaScript.
- In-app browser manually inspected: hero, composer, configured route, brief.
- Archived regression checks: Python 305 passed, three live marketplace tests
  deselected; Ruff passed; archived web 253 passed (including 185 parity cases);
  golden corpus 40/40, zero unsafe false-allows. These remain archived evidence,
  not SignalForge product claims.

The environment does not put npm/uv on its default PATH. npm scripts were run
through the available npm package runner; archived Python checks used the
repository's existing .venv executables. No dependency changes were needed.
One pre-existing FastAPI/Starlette httpx deprecation warning remains.

## Screenshots

Reproducible browser captures: test-results/screenshots/ (ignored generated data).
Selected portfolio captures: ../../docs/screenshots/signalforge-v2/.

- desktop-hero-viewport.png — typographic opening, no hero card.
- desktop-route-midscroll.png — pinned compose chapter with partial SVG paths.
- desktop-route-verified.png — complete modeled route and simulated evidence.
- desktop-paper-report.png — ivory editorial memo and evidence margin.
- desktop-brief.png — functioning report and line-item research receipt.
- desktop-plan.png — selected services, constraints and explicit Run.
- desktop-history.png — Archive index, not a card gallery.
- mobile-hero-viewport.png / mobile-route-story.png — unpinned mobile equivalent.

Most full-page captures use reduced motion for stable composition. The pinned
mid-scroll and verified captures explicitly use normal motion, and are verified
through DOM geometry and SVG state assertions rather than a decorative screenshot.

## Deliberate simplifications

- No pinning below 900 × 850px: a tall diagram must not trap off-screen content.
- The story illustrates existing fixtures, not the suggested invented 8-source /
  5-claim example. Modeled cost is not actual service spending.
- No infinite motion, pointer chasing, scroll hijacking or Framer Motion.
- No automated cross-browser claim: browser suite uses Chromium.
- Deployment instructions and existing hosted limitations are unchanged.
