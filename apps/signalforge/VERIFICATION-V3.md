# SignalForge V3 presentation verification — 2026-08-30

## Scope

V2's editorial composition retained. Domain, planner, providers, session storage,
API handlers, dependency manifests and Next/Vercel configuration are unchanged.
The report, receipt, explicit Run consent, exports, fictional provenance and $0
actual-spend contract are preserved. No backend or external execution added.

## Added motion and craft

- SignalField: original SVG contours and sparse coordinates, faint pointer light,
  finite 14-second point settling, paused off-screen / on document hide. Two
  compositions: hero and closing. Static on mobile and reduced motion.
- Hero: 2.15-second masked typography, SVG stroke draw, coordinate labels and
  final brief marker. Metadata is explicitly a demo, never live telemetry.
- Route: existing 300vh GSAP pin/scrub now draws directional selected paths,
  collapses the rejected branch, reveals a low-opacity confidence trail and
  pulses the convergence node once. All numbers are existing fixture values.
- Evidence: sequential source marks and SVG connections, then corroboration
  **in simulation**. Plays once; the final SSR state is readable without JS.
- Primary CTA: fine-pointer desktop magnetic content, stable hit area; directional
  link underlines, arrow movement, selected policy/budget indicator, provider and
  Archive row route traces. Native keyboard/focus and reduced-motion equivalents.
- Pages: short entrance/continuity line, never an overlay or navigation delay.
- Brief: paper/ink surface, printed masthead, decorative demo stamp, reading
  rhythm, mono receipt appendix and explicit fixture-confidence metadata.

All GSAP lifecycles use scoped useGSAP and matchMedia cleanup. No infinite
animation, external imagery, new fonts, large libraries, or new dependencies.

## Verification

- ESLint and strict TypeScript pass.
- Vitest: 65 tests pass.
- Next.js 16.3.3 production build passes; existing routes unchanged.
- Playwright: 23 pass, 9 intentionally skipped project-specific duplicates.
  Covers full request/plan/Run/brief/exports/session flow; responsive geometry at
  390/768/1024/1440px; normal-motion pin/scrub; evidence completion and cleanup;
  keyboard precision controls; static no-JS and reduced-motion content; no page
  errors or external requests during the fixture workflow.
- In-app browser: local hero, example brief, and provenance inspected visually.
- Archived regressions: Python 305 pass (3 live tests deselected), Ruff passes;
  archived web 253 pass including 185 parity cases; golden corpus 40/40 correct,
  zero unsafe false-allows. One existing Starlette/httpx deprecation warning.

Screenshots: ../../docs/screenshots/signalforge-v3/. The live-motion captures are
desktop-route-midscroll, desktop-route-verified, and living-evidence. Full-page
captures use reduced motion for stable composition. Component-only memo captures
exclude fixed site chrome to avoid screenshot stitching artifacts.

## Deliberate limits

- No desktop pin under 900px width or 850px height; mobile is a staged sequence.
- Ambient motion settles rather than consuming CPU indefinitely.
- Page transitions are scoped entrances, not a global exit-animation router.
- Test browser is Chromium; no claim of a cross-browser/device laboratory.
- No product behavior, live-source availability or provenance claims changed.
- Production deploy uses the existing SignalForge Git integration and branch;
  no project, environment variable, account, or paid resource is created.
