# Agent Arbiter web design brief

## Audit of the Streamlit experience

- The current display headline occupies four lines at laptop height and pushes the primary action below the first viewport.
- A 300px sidebar carries only two destinations, reducing useful workspace while making the product feel like an admin dashboard.
- Configuration, evaluation, and evidence are separated by long rerun-driven pages, so the cause-and-effect relationship is difficult to inspect.
- Wide result tables clip cost and rationale fields. Technical boundary labels repeat instead of becoming progressive detail.
- Status colors are consistent, but source provenance, policy decisions, and safety state compete at the same visual weight.
- Terms such as “governed package” need a visible “preview only” qualifier in the public experience. “Agent” means the hypothetical worker profile—not an executing process.

## Art direction

**Emotion:** calm control and earned trust. **Archetype:** warm editorial infrastructure. The concept is a routing ledger: a precise field of public opportunities passes through explicit policy constraints and stops at a read-only decision.

## System

- **Type:** Newsreader for display copy, Inter for interface copy, IBM Plex Mono for reason codes and evidence constants. All are loaded through Next Font with system fallbacks.
- **Scale:** eyebrow 0.68rem, metadata 0.75rem, body 1rem, lead 1.15rem, section title clamp(2.15rem, 4vw, 4rem), hero clamp(3.25rem, 7.2vw, 7.2rem).
- **Spacing:** 4, 8, 12, 16, 24, 32, 48, 72, 96, 144px. Dense operator controls use the lower half; narrative sections use the upper half.
- **Color:** parchment `#f4f1e9`, paper `#fbfaf6`, ink `#17201d`, muted `#626a64`, line `#d8d7ce`, cobalt `#2545d3`, forest `#246343`, amber `#8b5b18`, refusal `#a13b32`. Color always accompanies text or an icon.
- **Shape/depth:** square and lightly chamfered surfaces, 1px rules, restrained 6–14px radii, almost no shadow. Hierarchy comes from type, grid, and whitespace.

## Interaction

- Navigation remains legible before and after sticky-state transitions.
- ScrollTrigger transforms establish sequence without hiding section text. Trigger positions refresh when mobile console panels change document height. Hero routing nodes respond subtly to pointer and scroll.
- Decision cards stagger once. The package preview opens with a short transform/opacity transition and restores focus on close.
- All state is React memory only. No local storage, downloads, approvals, or background polling.
- Reduced-motion removes transforms, smoothing, and animated progress while preserving immediate state changes.

## Copy voice

Direct, factual, and operator-oriented. Prefer “evaluate,” “inspect,” “preview,” and “stop.” Never imply execution, earnings, live transactions, or autonomous marketplace participation. Source labels distinguish live, cached, controlled, and unavailable evidence.

## Accessibility

Semantic landmarks and headings, skip link, visible keyboard focus, 44px touch targets, labeled fieldsets, textual status labels, WCAG-conscious contrast, dialog focus management, no horizontal overflow at 390px, and full `prefers-reduced-motion` support.
