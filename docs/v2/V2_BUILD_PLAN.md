# SignalForge V2 Build Plan

## Delivery rule

Each phase begins in an isolated branch and Preview. A phase advances only after responsive, reduced-motion, accessibility, performance, data-integrity, and regression review. Production remains untouched until explicit approval. No phase schedules autonomous execution.

## Phase 0 — V2 visual laboratory

**Value:** choose a recognizable instrument language before disturbing working routes. **Scope:** three `/lab/v2` prototypes using existing data contracts and dependencies; no primary navigation. **Dependencies:** current tokens, real/empty fixtures limited to tests or explicit lab data. **Risks:** attractive but misleading economics, duplicated UI architecture. **Tests:** static truth labels, keyboard/reduced motion, 320–1920px layout, client-boundary and bundle comparison. **Preview acceptance:** each concept works with real, unknown, empty, and degraded states. **Proof gate:** one direction improves comprehension and distinctiveness in user review without worse performance.

### Concept A — Typographic / Economic State

- **Idea:** a typographic balance sheet where reward, cost, uncertainty, and decision occupy a disciplined editorial field.
- **Hero:** one observed opportunity enters at the margin; type weight/width compresses as costs are applied, ending at an explicit conditional or insufficient-data state.
- **Typography:** expressive serif/display for the economic verdict, mono tabular ledger, restrained sans instructions. Prototype Recursive axes only if state remains readable.
- **Interaction/animation:** scrub or explicit-step economic compression, threshold rule, focused provenance trace; no ambient spectacle.
- **Data:** existing real economics and empty/unknown states only.
- **Stack:** current React, GSAP, Motion, CSS/SVG; no new dependency.
- **Mobile/accessibility:** vertical ledger, ordered summary, immediate reduced-motion state, live regions only after user-triggered recalculation.
- **Risk:** type-axis motion could overstate precision or harm locale layout.
- **SignalForge signature:** economics literally reshape the interface.

### Concept B — Live Market / Signal Field

- **Idea:** a sparse market field in which each observation is positioned by freshness, economic completeness, and capability—not a decorative particle cloud.
- **Hero:** a truthful source pulse resolves into a small market capture or a precise empty state.
- **Typography:** compact research labels, editorial opportunity title, mono source time/economics.
- **Interaction/animation:** SIGNAL TRACE connects a selected observation to its provenance and underwriting entry; filtering rearranges marks once.
- **Data:** bounded Radar records, connector health, timestamps, and completeness. No fake volume.
- **Stack:** local SVG with current Motion; GSAP for one capture sequence.
- **Mobile/accessibility:** replace spatial field with ordered source rows; chart has a synchronized text table.
- **Risk:** spatial encoding may look like a trading screen or imply exhaustive market coverage.
- **SignalForge signature:** live supply becomes an inspectable evidence map, with gaps visible.

### Concept C — Experimental Instrument / Route System

- **Idea:** a laboratory instrument where capability lanes compete for a limited budget and collapse into a contract.
- **Hero:** objective enters as a left-edge datum; capability gates and candidate paths open across the field; the selected route becomes a receipt spine.
- **Typography:** technical schematic labels plus an editorial decision headline; mono for route cost and constraints.
- **Interaction/animation:** route competition, elimination with persistent reasons, decision morph, and keyboard-selectable nodes.
- **Data:** ObjectiveFrame, selected/rejected offers, dependency order, provenance, and budget.
- **Stack:** local SVG/HTML; GSAP for the signature route timeline, Motion for node state.
- **Mobile/accessibility:** staged capability steps and a semantic ordered list; no pan/zoom requirement.
- **Risk:** highest complexity and greatest chance of decorative “agent graph” theater.
- **SignalForge signature:** constraints visibly compile a market of possibilities into an auditable route.

**Recommended first prototype: Concept A.** It directly expresses the underwriting wedge, works with incomplete real data, has the lowest accessibility/bundle risk, and can later accept the best provenance behavior from B and route behavior from C.

## Phase 1 — Signature Profit Engine / homepage

**Value:** explain the product in five seconds with real economics. **Scope:** short hero, real/empty market capture, Profit Engine transformation, two actions. **Dependencies:** Concept A validation and existing opportunity/economics API. **Risks:** conditional values presented as realized profit. **Tests:** provenance snapshots, unknown-data copy, locale and all responsive widths, Core Web Vitals budget. **Preview acceptance:** no fixture economics in hosted live mode; complete comprehension without animation. **Proof gate:** users correctly explain observed vs assumed vs derived values.

## Phase 2 — Forge Lab

**Value:** underwrite a user-defined task without pretending it is observed work. **Scope:** objective, capability mapping, explicit payout/cost assumptions, local preview, route compilation. **Dependencies:** unified underwriting-subject model. **Risks:** `user_scenario` mistaken for market evidence. **Tests:** provenance immutability, no request on keystroke, validation, fallback decomposition, keyboard/mobile. **Preview acceptance:** missing payout remains unknown and every scenario field is labeled. **Proof gate:** a user reaches a useful route and knows which inputs they supplied.

## Phase 3 — Underwriting workstation

**Value:** inspect one opportunity from evidence through claim-readiness. **Scope:** Radar detail, assumption panel, economic waterfall, receipt, persistent page context. **Dependencies:** Phases 1–2 grammar. **Risks:** density and destructive-looking authorization cues. **Tests:** exact money, conditional states, claim authorization false, source degradation, 429 recovery. **Preview acceptance:** complete and incomplete cases remain legible at every target width. **Proof gate:** operators can audit a decision without opening JSON.

## Phase 4 — Route Arena + Profit Frontier

**Value:** compare feasible fulfillment routes and understand sensitivity. **Scope:** deterministic `RouteCandidateSet`, route competition view, bounded frontier chart. **Dependencies:** API projection and explicit scenario ranges. **Risks:** client/server score drift and false probability precision. **Tests:** candidate determinism, coverage/rejection parity, chart/table equivalence, conservative rounding. **Preview acceptance:** every mark maps to contract data and has a text alternative. **Proof gate:** users can identify why the winner changes.

## Phase 5 — Signal Tests

**Value:** answer “what would have to change?” with auditable counterfactuals. **Scope:** named input changes, before/after receipts, deterministic deltas; no persistence required initially. **Dependencies:** frontier inputs and versioned calculation model. **Risks:** scenario explosion and accidental forecast claims. **Tests:** one-change isolation, hash/version behavior, bounds, localization. **Preview acceptance:** tests never overwrite observed fields. **Proof gate:** users use the result to refine a route or reject work.

## Phase 6 — Strategies + watches

**Value:** reuse underwriting policy and monitor matching work. **Scope:** versioned strategies, saved public/source query, cadence, deduplication, opt-in notification interface. **Dependencies:** ownership/privacy decision, durable records, scheduler. **Risks:** alert fatigue, objective retention, source pressure. **Tests:** tenant isolation when accounts exist, dedupe, cadence/lease, deletion/export, no source writes. **Preview acceptance:** watch status and source gaps are explicit. **Proof gate:** repeat use occurs for saved strategies, not novelty.

## Phase 7 — History + backtester foundations

**Value:** compare decisions against actual historical observations. **Scope:** append-only market/pricing/FX snapshots, versioned evaluations, outcome-import boundary; no claimed performance without outcomes. **Dependencies:** retention/legal review and sufficient collection period. **Risks:** survivorship bias, schema drift, storage cost. **Tests:** temporal queries, immutable versions, missing-interval behavior, migration replay. **Preview acceptance:** zero-history and gaps remain visible. **Proof gate:** enough high-quality history exists before a backtester UI is built.

## Phase 8 — Monetization

**Value:** validate willingness to pay for saved strategies, watches, and API volume. **Scope:** product/entitlement design compatible with Free, Pro, and Builder/API; no provider-specific billing dependency required. **Dependencies:** measured retention and clear cost-to-serve. **Risks:** pricing before repeat value. **Tests:** entitlement boundaries and usage accounting design. **Preview acceptance:** commercial hypotheses are labeled non-live. **Proof gate:** interviews or usage show a paid problem.

## Phase 9 — Execution research only

**Value:** define whether a separately authorized executor can safely consume immutable contracts. **Scope:** threat model, sandbox/egress design, approvals, idempotency, kill switch, verifier and dispute model. **Dependencies:** strong outcomes and explicit operator demand. **Risks:** financial, legal, credential, and marketplace harm. **Tests:** design-level adversarial scenarios only. **Preview acceptance:** documentation makes clear no execution exists. **Proof gate:** a separate security milestone and explicit owner authorization are required before any implementation.
