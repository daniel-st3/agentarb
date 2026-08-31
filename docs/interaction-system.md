# SignalForge interaction ownership

This layer changes presentation only. The planner, route schemas, API/MCP/A2A
interfaces, catalog permissions and execution boundaries are unchanged.

## Two engines, distinct surfaces

GSAP continues to own hero entrance, Signal Field, pinned narrative, cinematic
page transitions and SVG route drawing. Motion owns the command dialog, input
response, changing heuristic labels, filter-result fades, inline listing details,
technical explanations and the contract-composition inspector. The input marker
has separate nested nodes: GSAP settles the outer marker once; Motion responds
on the inner glyph. Motion never targets `.preview-trace path`, narrative SVGs
or a `data-reveal` node. Ownership is marked in the DOM and tested in source.

`LazyMotion` loads `domMax` asynchronously because layout projection is required.
All primitives use `m`; strict mode guards accidental heavyweight components.
The command palette is separately code-split and fetched on first open. There
are no UI kits, charts, images, video, WebGL or animation loops in this increment.
No Kokonut or Bklit code is installed or copied. The chart is original SVG/DOM.

## Keyboard and accessibility

- Cmd/Ctrl+K or the navigation control opens the objective launcher.
- Native modal dialog isolates background interaction. Tab/Shift+Tab wrap;
  Escape closes, and focus returns to the opener.
- Examples prefill one input. Submission validates the same bounded objective
  schema on the client and `/forge` server page. The objective travels in a URL
  query parameter: it is shareable and can enter ordinary platform access logs.
  Do not enter confidential information. This does not create a saved run.
- Existing Cmd/Ctrl+Enter compilation remains unchanged; no request runs while
  typing or selecting examples.
- Native catalog disclosure retains keyboard behavior. Result transitions mark
  departing content inert and hidden from assistive technology; result counts
  announce updates. Filter state stays in the URL.
- Technical explanations work on focus, hover and tap, and dismiss with Escape.
  The description is always available to assistive technology.
- Route nodes are real buttons with selection state and a labeled detail region.
  Mobile stacks the route composition rather than compressing the diagram.
- Reduced motion uses zero-duration changes, no translated states and no layout
  projection. Existing GSAP reduced-motion/static narrative branches remain intact.

## Truthful route inspection

The composition inspector is a projection of the existing route contract. Required
capabilities, simulated selected providers, observed catalog options and rejected
alternatives have explicit text labels. Catalog context is drawn as a dashed
branch, not a service-execution edge. The inspector never invents observations,
measured reliability, execution, payments or animated telemetry. Missing observed
options remain an explicit empty state; actual source timestamps are unchanged.

The rejected-node sample is bounded to three; the full existing ledger is retained.
No count-up was added: source timestamps and truthful freshness labels are more
useful here than animating aggregate numbers.

Verification: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run test:e2e`, `npm audit`, plus opt-in `npm run verify:runtime`. Browser
screenshots are generated under `apps/signalforge/test-results/screenshots/`.
