# Agent Arbiter — public web experience

Next.js App Router, strict TypeScript, React, Tailwind v4, GSAP/ScrollTrigger, and
Framer Motion. The Python application remains the source of truth and is not
deployed with this frontend.

## Local production preview

Requires Node 22.13+ and pnpm 11.19.

```bash
cd web
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm start --hostname 127.0.0.1
```

Open http://127.0.0.1:3000. No environment variables, LLM keys, accounts, database,
or Python server are required. The only runtime network dependencies are two
fixed public listing GETs. Font files are self-hosted by Next Font after the build.

## Architecture and source-of-truth boundary

```text
React session state
  → validated POST /api/evaluate
  → fixed public GET listing requests (parallel, bounded, no redirects)
  → normalized public records + separately labelled controlled fixtures
  → Python-derived safety rules + deterministic TypeScript policy evaluator
  → reasoned decisions → read-only package preview → STOP
```

Python cannot execute in a standard Next.js Node function. Rather than launching
Python, importing the local worker, or creating a second hosted service, this app
uses a small deterministic TypeScript port. Its rule tables, category precedence,
heuristic parameters, safety regexes, and controlled fixtures are generated from
the existing Python modules. **184 parity cases** compare decisions, reason codes,
confidence, success probability, execution cost, and projected margin against the
Python hosted engine across four profiles.

From the repository root, check drift with:

```bash
PYTHONPATH=src uv run python scripts/export_web_contract.py --check
```

The export command without `--check` emits the generated contract to stdout.
The `parity` member belongs in `web/tests/fixtures/policy-parity.json`; the remaining
members belong in `web/src/lib/generated-policy.json`. Neither file contains keys,
prompts, marketplace account data, or visitor data. Re-run parity tests whenever
Python governance logic changes.

## Public HTTP contract

| Route | Method | Boundary |
|---|---|---|
| `/api/discovery` | GET | UUID `x-sandbox-session` header required; no query parameters |
| `/api/evaluate` | POST | Strict bounded profile/policy JSON; UUID session ID; no query parameters |

No dynamic upstream URL, proxy path, user credential, cookie, auth header, or
request body can be forwarded to a marketplace. Upstream requests have fixed
origins and paths, `method: GET`, `redirect: error`, `credentials: omit`, an
8-second timeout, a 256KiB response ceiling, and at most five records per source.
Incoming evaluation bodies are limited to 16KiB. Unknown fields and invalid
thresholds fail closed before discovery. Cross-origin requests are rejected;
CORS is not enabled. Responses are not cached by the browser or CDN.

Allowed upstream URLs:

- `https://opentask.ai/api/tasks?limit=5`
- `https://api.execution.market/api/v1/tasks/available?limit=5`

The frontend never calls the local REST worker API. There are no approval,
package download, worker, write, ledger, artifact, provider, wallet, payment, or
authentication routes. Policy results and preview snapshots exist only in React
memory and disappear on reload/new session. The server retains only short-lived
anonymous cooldown timestamps, not profiles, policies, results, or task content.
Hosting infrastructure may keep standard access logs; this app never logs request
bodies, profile inputs, or credentials.

### Refresh limiting limitation

The client enforces a 30-second refresh cooldown, including failed requests.
Both server endpoints share a bounded, expiring, in-process cooldown map keyed by
the random browser-session UUID. This prevents repeated normal-session refreshes
on one instance. **It is not a distributed abuse-prevention guarantee**: Vercel
can run multiple instances or cold-start, and an adversarial caller can rotate
session IDs. Strict globally coordinated enforcement requires durable state,
which this phase deliberately forbids. Before a broad public launch, configure
Vercel edge/firewall rate limiting as an additional deployment gate; do not
silently add a database or visitor tracking.

## Evidence and cost accounting

- **Live public data:** successfully fetched in this session; observed timestamp
  retained. After 30 seconds, the UI labels those rows **Cached public data**.
- **Controlled demonstration data:** versioned fixtures from Python, never live.
- **Offline / unavailable:** source failed; controlled fixtures remain available.
- **Empty source:** endpoint succeeded but returned no current listings.
- **Simulation only:** controlled fixtures and offline tests—not a lifecycle run.
- **Real outcome evidence:** zero; no marketplace action is possible.

`actual_llm_inference_cost_usd` is always zero with
`actual_llm_cost_status: no_llm_call`.
`estimated_task_execution_cost_usd`, `estimated_other_cost_usd`, and
`expected_margin_usd` retain their exact names in decisions and preview JSON.
Expected margin is payout × heuristic success probability − projected task cost
− projected other cost. It is not realized earnings or a calibrated success claim.
If a prior gate stops evaluation, projected metrics are displayed as not estimated.
`simulated_pnl_usd` is absent from this application.

The regex screen is conservative and bounded, not a universal semantic safety
classifier. Structural absence of action capability is the ultimate public boundary.

## Verification and screenshots

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Run E2E against the production preview, not the development server. The hermetic
browser tests explicitly simulate public-source unavailability and use controlled
fixtures. They capture hero, sandbox, configuration, loading, decisions, preview,
safety, mobile, and 1440/1024/768/390px checks in `../docs/screenshots/web/`.
Fresh public checks are separate from those controlled screenshots.

Native dialog focus containment, Escape dismissal, focus restoration, semantic
controls, visible focus, and reduced-motion behavior are tested. GSAP lifecycles
use scoped `useGSAP` contexts; state transitions use Motion. No scroll-jacking,
idle animation loop, external illustration, or third-party runtime script exists.

## Vercel deployment preparation — not deployed

1. Review and manually push the local commit when ready.
2. Import `daniel-st3/agentarb` in Vercel and choose the reviewed branch
   `claude/verify-bounty-api-facts-f6ccdu`.
3. Set **Root Directory: `web`**, framework **Next.js**, Node **22.x** or newer
   supported version, install **`pnpm install --frozen-lockfile`**, build **`pnpm build`**.
4. Do not add marketplace credentials, Groq keys, worker API URLs, databases,
   payments, authentication, or other integrations. No application secrets are needed.
5. Review edge rate limiting, hosting quotas, function timeouts, and platform
   logging settings before public exposure. Do not enable paid services implicitly.
6. Verify the preview environment’s fixed GET sources, source labels, reduced motion,
   mobile layout, and unavailable-source fallback before promoting it.

The existing Streamlit app remains available separately; it is not embedded or
proxied. No deployment or external project change is performed by this milestone.

References: [Vercel project configuration](https://vercel.com/docs/projects/project-configuration),
[Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route).
