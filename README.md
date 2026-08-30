# SignalForge

**Turn one question into a verified brief.**

SignalForge explores a research-service procurement problem: choosing the right
information supply chain inside a hard budget, then showing how every conclusion
was sourced. The intended outcome is a concise intelligence brief—not a model
picker, another chat transcript, or an API directory.

**Current release: a complete fictional research demo.** Planning, execution,
verification rules, exports, and the responsive UI work. Evidence and service
prices are simulated. Actual service spend is always $0. This is not live research.

## What the MVP does

- A Next.js entry page and request → plan → explicit Run → brief workflow.
- Three fictional cases: Northstar Search, AtlasGrid, and Lumen Labs.
- Four reproducible policies: Best value, Cheapest, Most verified, Fastest.
- Hard budget checks in planning and execution, with integer-cent arithmetic.
- Selected providers, rejected alternatives, and plain-language explanations.
- An executive answer, findings, known/unknown split, evidence ledger, and receipt.
- Markdown and audit JSON exports, example history, and tab-local new runs.
- Works without keys; makes zero external provider calls.

Questions outside the fixture topics return an evidence-gap brief. Matched topics
produce a **predefined case brief**, not bespoke research. Target URLs are recorded
as context only and are never fetched.

## Why not a chatbot or a directory?

The useful hypothesis is an outcome with an inspectable research route: services
are selected under a cap, alternatives are explained, important claims require
independent support, and costs are accounted for separately from confidence.
A chatbot alone does not establish these controls; a directory stops before
planning and evidence assembly. This demo proves the workflow and deterministic
tradeoffs—not real source quality, demand, measured savings, or unit economics.

## Architecture

```text
Research request + hard budget + policy
                ↓
Validated TypeScript planner → selected demo providers
                ↓                    ↓
          explicit Run        authored fixture evidence
                └───────────────→ verification
                                      ↓
                              cited brief + receipt
                                      ↓
                           tab-local repository / export
```

The active app is **apps/signalforge/**: Next.js 16.3.3 App Router, React,
TypeScript strict mode, Tailwind CSS, a small custom component system, Lucide,
Zod, and scoped GSAP/@gsap/react/ScrollTrigger. Geist is self-hosted by next/font.
No Python service, Streamlit process, external database, or provider key is needed.

| API | Behavior |
|---|---|
| POST /api/plan | Validates the request; returns a deterministic plan |
| POST /api/run | Requires consent:true; rebuilds the plan from validated request inputs and runs only fixed mock adapters |

Both handlers are stateless, no-store, accept at most 16 KiB, and make no external
requests. Client-supplied provider IDs, prices, executable instructions, or plans
are not accepted. There is no approval, worker, marketplace, or payment endpoint.
Same-origin browser requests are checked against HTTP Host; forwarded host headers
are not trusted. No auth, cookies, bodies, or URLs are forwarded upstream because
there is no upstream I/O.

This bounded zero-I/O demo does not claim distributed rate limiting. The older
web/ app retains its Upstash protection. Before enabling real research, add
distributed limits, egress controls, timeouts, source licensing, and server-side
cost reservations. Vercel invocation usage still belongs to the hosting operator;
configure platform usage alerts before deployment.

## Policy and scoring

Routes contain research + optional independent verification + deterministic
synthesis. Unavailable, unconfigured, catalog-only, incompatible, quality <0.70,
and reliability <0.80 offers are excluded first.

```text
quality = mean(expectedQuality × reliability × capabilityFit)
cost = modeledRouteCost / max(hardBudget, oneCent)
latency = modeledSequentialLatency / 20 seconds
diversity = 1 with independent verification; 0.25 for one source family

Best value   = 0.48 quality + 0.27 diversity − 0.18 cost − 0.07 latency
Most verified = 0.35 quality + 0.55 diversity − 0.07 cost − 0.03 latency
```

Capability fit is an eligibility gate, so selected fits equal 1. Cheapest minimizes
route cost after eligibility; Fastest minimizes latency after eligibility and
budget checks. Ties use quality, then stable order. The numbers are explicit
fixture assumptions, not measured vendor performance.

| Amount | Meaning |
|---|---|
| budgetUsd | Hard modeled cost cap, $0–$10, whole cents |
| estimatedCostUsd / estimatedSpendUsd | Predicted cost from simulated offers |
| simulatedCostUsd / simulatedSpendUsd | Modeled cost of completed mock steps |
| actualCostUsd / actualSpendUsd | Exactly zero; no paid service or LLM call |

The planner checks the entire route. The executor checks cumulative modeled cost
before each step and verifies returned costs. Estimates never become real spend.

## Provenance and safety

- **MockResearchProvider** supplies authored fictional company evidence. Rapid
  index is a faster modeled alternative with the same source family, not independent
  evidence.
- **MockPremiumVerificationProvider** supplies a separately modeled reviewer and
  publisher at $0.08 simulated cost, $0 actual spend.
- **MockSynthesisProvider** compiles supplied evidence without an LLM.
- **PublicWebResearchProvider** is an unavailable, typed integration seam. No real
  API adapter or credential consumption is implemented. Adding a key cannot enable
  it. This deliberate MVP simplification guarantees no paid service calls.
- **X402ServiceCatalogProvider** is a versioned local illustrative catalog concept,
  labelled x402_catalog_only. It is not a discovered live service; execute() throws.
- All mock findings say **Simulated demo evidence**. Fictional documents have
  sourceUrl:null; internal evidence anchors replace fabricated public URLs.
- Corroboration requires different source families **and** different providers.
  The demo label is **corroborated in simulation**. One source remains single-source;
  absent evidence is unverified. Synthetic corroboration is not real verification.
- No wallet, payment, transaction, signing, live x402, account, marketplace action,
  scraping, browser automation, or arbitrary-code-execution code is in the deployed app.
- No application request-body logging or persistent visitor data. Hosting providers
  may retain standard access metadata; configure their retention separately.
- Exports contain the request and optional target URL. Review before sharing.

## Repository and storage

ResearchRepository defines list/get/save. DemoRepository is instance-scoped in
React. Runs stay in tab memory through in-app navigation, then disappear on reload
or close. No cookies, localStorage, sessionStorage, server database, filesystem
writes, or cross-visitor server map. Maximum 30 records including examples.
Completed snapshots cannot be overwritten.

tools/local-repository.ts is an append-only Node SQLite adapter for local offline
analysis. It refuses VERCEL and is never imported by the app. It is **not** Vercel
persistence. HostedRepository fails closed until a durable adapter is implemented.
See [the storage contract](apps/signalforge/STORAGE.md).

## Local setup and verification

Use Node 22.13+ (Node 24 LTS recommended) and npm:

```bash
cd apps/signalforge
npm ci
npm run dev
# Open http://127.0.0.1:3000
```

No .env is required. apps/signalforge/.env.example contains comments only: the
demo has no live provider keys or storage controls. Never use NEXT_PUBLIC_ for
secrets. The root .env.example belongs to archived Python and is not consumed.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
npm run start
```

Playwright starts a production server on port 3002; build first. Tests cover
API flow, downloads, session isolation, reduced motion, and 390/768/1024/1440px
geometry. Screenshots: apps/signalforge/test-results/screenshots/.

## Visual system — SignalForge V3

An editorial interface: Newsreader display/report typography, Geist UI, Geist Mono
metadata, near-black fields and an ivory research memo. Hairline rows replace
enclosing panels in the composer, route sheet, brief, receipt and Archive.

The landing's scoped GSAP sequence introduces a signal trace; a 300vh pinned
ScrollTrigger narrative explains framing, service comparison, route composition
and simulated corroboration. It replays the existing Northstar fixture:
$0.25 cap, $0.08 modeled route, $0 actual spend, four documents, five excerpts,
two simulated corroborations. No new evidence or provider capability is implied.

Below 900px width or 850px height, and for reduced motion, the route becomes a
static staged story without pinning. The landing remains readable without
JavaScript. V3 adds a procedural contour field with finite, off-screen-paused
motion; a selected-route trail and collapsing rejected branch; a one-time
two-source evidence connection; magnetic primary links; keyboard-safe precision
selectors; and lightweight page entrances. Completed briefs use an ivory/ink
report surface and archival metadata. Reduced motion retains the final composed
state, without pinning, drift, or animated controls. No stock imagery, video,
new animation dependency, or provider behavior was introduced.

See the [V3 design brief](apps/signalforge/DESIGN-V3.md) and
[verification report](apps/signalforge/VERIFICATION-V3.md).

## Vercel deployment — manual, not performed

1. Review and push the branch yourself: claude/verify-bounty-api-facts-f6ccdu.
2. Import the repository in Vercel; select that branch for a preview.
3. **Root Directory: apps/signalforge**. Framework: Next.js. Node: 24.x.
4. Install: npm ci. Build: npm run build. Output: Next.js default.
5. No environment variables are required. Do not copy Agent Arbiter credentials.
6. Review platform usage limits/alerts, then deploy manually when ready.
7. Verify /, /forge, /history, /forge/example-1; run Most verified and $0 Cheapest.
8. Verify zero actual spend, explicit simulation labels, and cleared session runs
   after reload. Audit JSON must contain schemaVersion:v1 and actualSpendUsd:0.

No vercel.json is needed. CLI alternative, from apps/signalforge:
npx vercel for a preview; npx vercel --prod only for an intentional production
deployment. These require your Vercel account and create external resources.
No deployment or push was performed for this implementation.

## 90-second demo

```bash
cd apps/signalforge
npm ci
npm run build
npm run start
```

- **0–15s:** Open /. Show the route/receipt artifact and illustrative-demo label.
- **15–30s:** Forge a brief. Northstar example, $0.25, Most verified.
- **30–45s:** Inspect the selected route, $0.08 modeled/$0 actual, and excluded
  live/catalog alternatives. Click Run research.
- **45–65s:** Read the answer. Two claims are corroborated in simulation;
  commercial traction is single-source. Open the evidence ledger.
- **65–80s:** Inspect the receipt and export JSON. Source URLs are null because
  these are authored documents, not fabricated citations.
- **80–90s:** Open the AtlasGrid Cheapest history example: $0 modeled, no independent
  verification. The policy choice has a visible consequence.

## Future commercial hypothesis — not live offers

- Quick brief: possible one-off paid tier.
- Verified brief: possible premium tier with independently checked evidence.
- Monitoring: possible future recurring product.

First validate whether the decision-ready artifact is useful enough to buy.
No payment collection or commercial tier is implemented.

## What changed from Agent Arbiter

The original prototype routed cross-marketplace work opportunities. Unreliable
task supply and human acceptance gates weakened that autonomy thesis. SignalForge
shifts the control point to research-service selection and evidence quality.
Hard limits, deterministic scoring, safe configuration, mocks, and audit discipline
remain. Marketplace participation does not.

Python/Streamlit, the golden corpus, and the old web/ app remain intact as archived
reference code—not production dependencies or SignalForge evidence claims.
See [pivot notes](docs/pivot-notes.md), [archived README](docs/archive/AGENT-ARBITER-README.md),
and [design brief](apps/signalforge/DESIGN.md).
