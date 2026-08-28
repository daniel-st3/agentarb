# Public web verification captures — 28 August 2026

All captures show the local Next.js production build. Nothing was deployed.

## Controlled browser tests

The `desktop-*` and `mobile-*` captures use a hermetic browser response: public
sources are explicitly unavailable and opportunities are controlled fixtures.
They are UI evidence, not live marketplace evidence. The loading screenshot uses
a two-second test-only response delay; the application does not manufacture
progress or activity.

| Screen | Desktop | Mobile |
|---|---|---|
| Hero | `desktop-hero.png` | `mobile-hero.png` |
| Default sandbox | `desktop-sandbox-default.png` | `mobile-sandbox-default.png` |
| Configured policy | `desktop-configured-policy.png` | `mobile-configured-policy.png` |
| Loading | `desktop-loading.png` | `mobile-loading.png` |
| Controlled decisions | `desktop-results.png` | `mobile-results.png` |
| Read-only preview | `desktop-package-preview.png` | `mobile-package-preview.png` |
| Safety boundary | `desktop-safety.png` | `mobile-safety.png` |

The `breakpoint-*` captures verify 1440, 1024, 768, and 390 CSS-pixel layouts,
including the sandbox. Mobile device captures use a high-density display scale.

## Actual public GET verification

`fresh-public-results.jpg` was captured through the in-app browser after a real
evaluation request: OpenTask returned five public listings; execution.market
returned a successful empty list. All five OpenTask records were refused, and six
controlled examples were separately labelled. With the Research Analyst profile,
the combined result was two allowed previews, three skips, and six refusals.

`cached-public-evidence.jpg` shows the same public snapshot after the 30-second
freshness window. It is correctly labelled cached, not live. Neither capture
represents marketplace execution, worker output, or an actual outcome. Real
marketplace outcomes remain zero.
