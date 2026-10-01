# Layout review

Build the application, then run `npx playwright test --config playwright.visual.config.ts`.
Screenshots and traces are written outside the repository to `/tmp/valrun-layout-final`.
Set `VALRUN_VISUAL_DIR` to retain a separate before/after pass.

The suite covers 13 states at 1920×1080, 1440×900, 1280×800, 768×1024 and 390×844,
plus Spanish/French forms under reduced motion. Inspect the screenshots after each
layout change; geometry assertions cannot establish good visual hierarchy by themselves.

Underwriting fixtures use the canonical deterministic evaluator and receipt hash.
Synthesis responses are explicit test fixtures; no provider is called.
Private History and saved snapshots use the actual React components rendered with
test-only dependency-boundary mocks, then mounted in the local application's chrome.
These screenshots verify layout, **not authenticated sessions or RLS**. No fixture
is bundled into the app, written to Supabase or exposed on a production route.
