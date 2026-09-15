# SignalForge V2 Motion System

## Doctrine

Motion must explain causality, competition, compression, provenance, evidence, uncertainty, or a decision threshold. Static HTML must retain the complete story. `prefers-reduced-motion` receives the resolved state, never missing information.

## Named motion language

| Motion | Communicates | Use | Do not use | Preferred implementation | Reduced-motion equivalent | Main risk |
| --- | --- | --- | --- | --- | --- | --- |
| **SIGNAL TRACE** | input flowing to a capability or source | objective-to-route paths | ornamental page borders | GSAP for choreographed SVG; Motion for isolated state links | complete path plus direction marker | excessive SVG work |
| **ECONOMIC COMPRESSION** | gross reward reduced by costs and risk | Profit Engine and waterfall | unrelated page transitions | GSAP timeline or CSS transform/clip | ordered ledger with final total | misleading interpolation |
| **ROUTE COMPETITION** | candidates evaluated in parallel | Route Arena | simple lists | GSAP timeline; Motion layout for interactive filtering | ranked table with reasons | cognitive overload |
| **ROUTE ELIMINATION** | option rejected by a named constraint | budget/eligibility comparison | hiding errors | GSAP FLIP only for complex spatial moves; Motion exit otherwise | struck route and persistent reason | disappearance without explanation |
| **EVIDENCE REVEAL** | confidence increases as evidence arrives | receipt and verification story | fake “thinking” | GSAP ScrollTrigger for editorial sequence | all evidence visible and ordered | implying live activity |
| **NUMBER TRANSITION** | a real value changed | applied assumptions and totals | unknown-to-invented values, ambient counters | Motion/CSS; monospace tabular figures | immediate replacement plus changed-state cue | unreadable rolling digits |
| **THRESHOLD CROSSING** | value crosses policy boundary | margin, budget, or risk limits | arbitrary scroll milestones | Motion for interactive values; GSAP in Profit Engine | threshold line and explicit comparison | color-only meaning |
| **DECISION MORPH** | inputs resolve into a decision artifact | evaluation → receipt | route navigation decoration | GSAP Flip for signature transformation; Motion shared layout for local UI | adjacent before/after states | layout shift |
| **PROVENANCE TRACE** | derived value connects to its inputs | economics inspector and receipt | every metadata label | local SVG/CSS, Motion focus state | numbered references | visual clutter |
| **MARKET CAPTURE** | a live observation becomes a frozen snapshot | Radar → underwriting | simulated “live” telemetry | GSAP once on explicit capture; otherwise CSS | timestamped snapshot marker | overstating freshness |

Animations should usually complete in 120–450ms for controls and under 2.4s for a signature sequence. Scrubbed storytelling belongs only on an explanatory surface, never the workstation’s native scroll.

## Ownership

GSAP owns cinematic timelines, ScrollTrigger stories, complex SVG/path orchestration, SplitText reveals, and complex FLIP sequences. Motion owns ordinary React enter/exit, layout transitions, focus/press/hover feedback, and springs. Never let both libraries animate the same element or property.

## Tooling recommendation matrix

| Tool | Why / exact surfaces | Forbidden | Complexity | Performance concern | Decision |
| --- | --- | --- | --- | --- | --- |
| **GSAP core** | Existing Profit Engine choreography, Route Arena competition, receipt transformation | ordinary button/list state | medium | timeline cleanup and bundle discipline | **Adopt now; already installed** |
| **ScrollTrigger** | `/how-it-works` or a bounded V2 lab story | Radar, Forge, receipt workstations | medium | pinned mobile layouts and refresh cost | **Keep selectively; already installed** |
| **SplitText** | one signature display reveal if licensing/package availability is confirmed | body text, translated controls | medium | DOM fragmentation and locale reflow | **Later evaluation** |
| **Flip** | a route becoming the chosen contract or decision receipt | routine navigation | medium | measuring large layouts | **Adopt later for one proven transition** |
| **DrawSVG** | optional ergonomic path drawing in a signature route | charts that CSS dash arrays handle cleanly | low–medium | plugin/license and marginal value | **Defer; native SVG first** |
| **Motion** | Existing filters, command interactions, drawers, list/layout state | GSAP-owned hero/path nodes | low | client bundle and accidental layout animation | **Adopt now; already installed** |
| **React Three Fiber** | only a future high-dimensional route/frontier prototype that beats 2D | homepage decoration, core workstation | high | WebGL battery, accessibility, fallback | **Defer** |
| **Three.js** | low-level spatial engine only if R3F is insufficient | ornamental 3D | high | large bundle and lifecycle work | **Reject for current V2** |
| **Lenis** | potentially one marketing story after measured testing | every product/workstation surface | medium | scroll semantics, nested regions, input latency | **Defer; native scrolling is default** |
| **HyperFrames** | deterministic capture of future demo media, not runtime UI | application animation/runtime dependency | medium | build/capture pipeline, no user value at runtime | **Reject for product runtime** |
| **Variable-font tooling** | CSS `font-variation-settings`; prototype Recursive axes in `/lab/v2` | changing values that imply false certainty | low | font payload, glyph coverage, layout shift | **Prototype now without new package** |
| **Observable Plot** | accessible Profit Frontier and later historical distributions | decorative analytics dashboard | medium | client bundle and customization limits | **Evaluate in Phase 4; do not install now** |
| **D3 modules** | custom scales/layout only when bespoke chart logic demands it | importing full D3 for one chart | high | bundle and accessibility are developer-owned | **Later, module-by-module** |
| **ECharts** | only if future history becomes a broad analytical workstation | early V2 and marketing | medium–high | weight and dashboard aesthetic | **Reject for current V2** |
| **Local SVG + scales** | first Profit Frontier, waterfall, and route prototype using current primitives | unbounded bespoke chart framework | medium | test burden and label collision | **Recommended now** |

Official references: [GSAP plugins](https://gsap.com/docs/v3/Plugins/), [Motion reduced motion](https://motion.dev/docs/react-motion-config), [R3F performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [Lenis](https://lenis.dev/), [HyperFrames](https://github.com/heygen-com/hyperframes), and [Observable Plot accessibility](https://observablehq.github.io/plot/features/accessibility).

## Performance and review gates

Animate transforms, opacity, SVG stroke, or CSS variables; avoid layout properties in continuous sequences. Scope GSAP contexts and clean up on unmount. Pause ambient work offscreen. Every motion PR must include keyboard operation, reduced-motion parity, mobile behavior, no-content-shift evidence, and a named statement of what the motion communicates.
