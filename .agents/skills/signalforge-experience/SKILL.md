---
name: signalforge-experience
description: Design or implement SignalForge product experiences, visual systems, interactions, data visualizations, or V2 surfaces while preserving economic truth, provenance, accessibility, performance, and the no-execution boundary.
---

# SignalForge Experience

Use this checklist for SignalForge UI, UX, motion, or product-surface work. Read root `AGENTS.md` first. For V2 work, consult the relevant file in `docs/v2/` rather than copying its doctrine into a task.

## Frame the work

1. Identify the user decision the surface improves.
2. Inventory the existing route, component, API, schema, motion owner, tests, and responsive states.
3. Classify every value as observed, published, market-observed, user-supplied, derived, or unknown.
4. State which no-execution boundary remains visible.

## Design standard

- Aim for a financial instrument × editorial research lab × technical schematic.
- Build hierarchy with type, rules, alignment, density, and negative space—not card grids or glass effects.
- Reject generic chatbot composition, AI gradients, ornamental glow, excessive pills/rounding, decorative 3D, and template dashboards.
- Use tabular numerals for economics. Never render unknown as zero or conditional profit as realized.
- Treat desktop and mobile as intentional compositions; test translated copy and 320–1920px widths.

## Motion standard

- Name what motion communicates: causality, competition, compression, provenance, evidence, uncertainty, or threshold.
- GSAP owns cinematic/scroll/path timelines; Motion owns ordinary React state and layout. Never animate the same element/property with both.
- Preserve complete static meaning with reduced motion. Prefer transform, opacity, SVG stroke, and CSS variables.

## Integration workflow

1. Prototype major visual ideas in an isolated lab/Preview.
2. Use real contract data or explicit test fixtures; never fabricate hosted economics.
3. Verify keyboard, focus, screen-reader semantics, reduced motion, mobile overflow, degraded/empty/unknown states, and bundle impact.
4. Run the relevant unit, Playwright, real-UI, boundary, lint, typecheck, and build gates.
5. Integrate into primary routes only after Preview review and measured comprehension/performance.

Do not add autonomous execution, marketplace writes, wallets, payments, or claims. Do not add a dependency without a named architectural role and evidence that current primitives are insufficient.
