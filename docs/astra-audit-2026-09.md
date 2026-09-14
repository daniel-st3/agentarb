# Astra audit: real-data Preview hardening

Scope: `codex/agent-arbitrage-underwriter` only. Production remains at
`c117f8441639a9c4ba3c66b581ba0c2e13745919`. No history rewrite, production
promotion, marketplace writes, execution, payment, or login operations.

## Correctness and security fixes

- Mixed recognized/unrecognized source requirements remain unknown. A partial
  capability mapping cannot represent complete fulfillment coverage.
- Recompute deadline/scoring eligibility from cached observations; an open Radar
  also expires its displayed receipt locally without polling or extra model calls.
- Recover an over-age Agent Bounties representation with a full conditional-cache
  refresh rather than accepting 304 responses indefinitely. Source timestamps are
  not replaced with the time of revalidation.
- Keep observed USDC separate from user USD scenarios and the legacy payout field.
  A scenario cannot acquire source-provided price confidence.
- Reject oversized URLs, duplicate query parameters, unsupported query fields,
  and misleading JSON MIME types before expensive processing.
- Preserve fail-closed shared quotas and expose only fixed configuration error
  codes in server logs. Public responses remain generic.

## Product improvements

- The homepage refreshes its bounded observed snapshot and links to the exact
  opportunity. Source failure is distinct from a successful empty inventory.
- Radar has bounded requests, safe cancellation, explicit retry cooldowns,
  readable decision explanations, source details, and receipt hashes.
- Policy edits require an explicit Apply action; typing does not make API calls.
- Clicking the selected row cannot strand it in a loading state. Deadline expiry
  invalidates a prior receipt and requires a fresh evaluation before download.
- English, Spanish and French explanations and responsive editorial layouts are
  preserved. Controlled browser-test records are explicitly marked as tests and
  never introduced into live runtime inventory.

## Verification

- SignalForge unit/security tests: 363 passed.
- Main Playwright suite: 70 passed, 10 platform-specific skips.
- Real-first browser suite: 19 passed, including all ten requested widths,
  Spanish/French, reduced motion, no-JavaScript rendering, 429 recovery, deadline
  expiry and exact opportunity navigation.
- ESLint, TypeScript, production build and client-boundary scan passed.
- Dependency audit: zero vulnerabilities at verification time.
- Archived Python: 305 passed, 3 live tests deselected; Ruff passed.
- Archived web/parity suite: 253 passed. Golden corpus: 40/40 correct, zero unsafe
  false-allows.
- Configured local runtime: valid real Groq frame; durable Redis read/write/delete,
  shared counter, snapshot metadata and all three rate-limit classes passed.

These are local verification results, not a claim that Preview has valid environment
scope. The previous Preview returned a fail-closed configuration error. Verify the
new deployment separately before declaring hosted APIs operational.

## Safe Preview diagnostics

Only fixed codes are logged, never values, caller addresses or upstream errors:

| Code | Configuration to check in the existing project's Preview/branch scope |
| --- | --- |
| `durable_pair_missing` | `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or the complete KV pair |
| `durable_url_invalid` | REST URL format accepted by the server allowlist |
| `cache_mode_invalid` | `CACHE_MODE` selection |
| `durable_store_required` | Hosted runtime requires a configured durable store |
| `rate_limit_salt_invalid` | `RATE_LIMIT_SALT` must satisfy the existing minimum length |

Never copy production values to logs or remove the guard to make a deployment
appear healthy. No dashboard login or environment mutation is part of this audit.
