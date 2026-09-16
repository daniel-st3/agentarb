# SignalForge V2 Design System

## Visual thesis

SignalForge should feel like a **financial instrument × editorial research lab × technical schematic**. Marketing surfaces use negative space and decisive type; work surfaces become denser as evidence and economic state accumulate. Rules, alignment, notation, and provenance do more work than containers.

Avoid generic dashboard grids, centered chatbot composers, purple “AI” gradients, glass panels, decorative glow, arbitrary pills, excessive rounding, stock illustrations, and 3D without a spatial-data purpose.

## Composition

- **Grid:** a 12-column desktop grid, 8 columns on tablet, and 4 on mobile. A narrow metadata rail may occupy one column; primary evidence spans 6–8 columns. Use `minmax(0, 1fr)` and content-driven heights.
- **Spacing:** use a 4px base, with 8/12px for dense controls, 20/32px for working groups, and 64/96/144px for editorial transitions. Density must reflect task depth, not route location.
- **Rules:** 1px hairlines establish sequence, grouping, thresholds, and provenance. Heavier rules are reserved for decisive totals and selected routes.
- **Surfaces:** page ground → working field → selected evidence → receipt artifact. Prefer tonal shifts and whitespace; use a bounded surface only when an object has its own state or action.
- **Density:** atmospheric on the homepage, measured in Radar, compact in Route Arena, and document-like in receipts.

## Color and state

Retain the warm graphite ground, soft ivory ink, mineral gray, oxidized signal orange / vermilion-coral accent, mineral green, and muted amber. Ultraviolet is reserved for an optional, rare data or spectral treatment—not the primary SignalForge brand accent. Color is semantic:

| Role | Treatment |
| --- | --- |
| Selected route | restrained accent line plus increased contrast |
| Observed / current | cool mineral tone; never “verified” by color alone |
| Conditional decision | amber-to-green only after inputs are complete |
| Unknown | neutral hatch, open marker, or interrupted rule |
| Rejected / unavailable | lowered contrast plus explicit reason |
| Risk threshold | fine amber rule; red is reserved for invalid or unsafe state |

Never encode status through color alone. Pair every state with text, shape, or line behavior.

## Provenance and numbers

Use compact mono labels: `OBSERVED`, `PUBLISHED`, `MARKET RATE`, `USER ASSUMPTION`, `DERIVED`, and `UNKNOWN`. Preserve these distinctions in charts, tooltips, exports, and receipts.

Financial values use tabular numerals, explicit currency, and conservative rounding. Align decimals in comparisons. Use em dashes or `UNKNOWN`, never `$0`, for missing values. Keep refundable capital separate from expense and prefix conditional results with their decision state.

## Typography

The display face may carry editorial authority; the UI face carries instructions; mono carries evidence, timestamps, identifiers, and economics. Do not vary families component by component. Variable axes may change subtly at a decision boundary, but never animate body copy or make certainty illegible.

### Commercial candidates — license required

- **ABC Arizona:** a variable sans-to-serif system suited to a distinctive economic-state spectrum. Test only after licensed files are supplied.
- **Canela / Canela Text:** calm editorial hierarchy and strong report typography; verify web and app licenses.
- **GT Alpina:** expressive, technical-editorial contrast with a useful typewriter voice; verify web licensing.
- **Tiempos:** serious research/report tone with headline and text roles; verify the required language glyph set and license.

No commercial font file may be downloaded, scraped, redistributed, or committed without an owner-supplied license.

### Open-source prototypes

- **Recursive (OFL):** `MONO`, `CASL`, `wght`, `slnt`, and `CRSV` axes can prototype a measured transition from mechanical input to judged output.
- **Fraunces (OFL):** `opsz`, `SOFT`, and `WONK` can add selective editorial tension in display text; avoid novelty settings in financial UI.
- **Newsreader + Geist + Geist Mono:** the existing legal, reliable baseline. Preserve it until a prototype proves a material identity improvement.

All candidates must be tested for English, Spanish, French, tabular figures, currency symbols, small labels, and layout stability.

## Interaction states

- Hover reveals causality: extend a route trace, expose provenance, or clarify a rejection.
- Focus uses a high-contrast offset rule and remains visible in forced-colors mode.
- Selection combines rule weight, marker fill, and a text label.
- Press transitions are fast opacity/translation changes, never elastic scale theater.
- Tooltips explain technical vocabulary and are available by focus; essential data must remain inline.

## Mobile doctrine

Mobile is a vertical instrument, not compressed desktop. Replace simultaneous route competition with staged comparisons, keep totals sticky only when they do not obscure content, allow tables to become labeled rows, and maintain 44px targets. Charts must expose a text/table equivalent. No horizontal page overflow, clipped translated text, or gesture-only controls.

## References

Font candidates should be evaluated from their official foundry/project sources: [ABC Arizona](https://abcdinamo.com/typefaces/arizona), [Canela Text](https://commercialtype.com/catalog/canela/canela_text), [GT Alpina](https://www.grillitype.com/typeface/gt-alpina), [Tiempos](https://klim.co.nz/collections/tiempos/), and [Recursive](https://github.com/arrowtype/recursive).
