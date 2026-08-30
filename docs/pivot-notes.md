# Agent Arbiter → SignalForge

SignalForge lives in apps/signalforge and is the only intended new Vercel root.
The Python src/arbiter, tests, scripts, fixtures, Streamlit app, and web/ prototype
remain intact as archived/reference implementations, not production dependencies.
Their tests and safety controls are preserved. The previous README is archived.

Retained: safety-before-estimation, capability normalization, deterministic policy
scoring, hard cost limits, explicit provenance, heuristic fixtures, immutable audit
snapshots, and separation of modeled cost from observed spend.

Changed: task-marketplace opportunity routing becomes research-service routing.
Human acceptance gates and unreliable task supply no longer define the workflow.
The output is a brief and evidence receipt, not a marketplace execution package.

The MVP deliberately runs fixture-only adapters. Public research is an unavailable
integration seam; catalog-only offers cannot execute. Fictional source documents
have no external URL. Session-local runs are portable across serverless cold starts
because the server validates the request and recomputes plans, never trusts a
client-supplied provider, price, or executable instruction.

The old web/ distributed limiter remains intact for its external discovery routes.
New demo endpoints have bounded input, deterministic bounded CPU, and zero upstream
I/O. Production real-provider execution is not implemented; it must add distributed
abuse controls, source licensing, and a hosted repository before being enabled.
