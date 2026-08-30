# ResearchRepository contract

The public demo uses an instance-local DemoRepository in React. Handlers return
validated snapshots and never write storage. The client explicitly saves them in
memory. Reloading creates a fresh repository with three examples; no cold-start
or server-affinity dependency exists.

The audit's complete state means completed processing, not durable saving.
Client memory saving is not labelled as a server-side persist_run event.
Exported JSON is the user's optional durable copy.

## Local analysis

LocalRepository in tools/local-repository.ts uses node:sqlite (Node 22.13+).
Construct with a local path, save completed Run snapshots, and close when finished.
Queries are parameterized; IDs are append-only and duplicates fail. It refuses
VERCEL and is outside the deployed import graph.

## Future hosted adapter

Implement ResearchRepository's asynchronous list/get/save against a durable
managed database. HostedRepository currently throws, and cannot be selected in
the public demo. Before wiring it in:

1. Define retention, deletion, authorization, and tenant isolation.
2. Validate RunSchema on ingress/egress; retain schema and catalog versions.
3. Enforce unique IDs and immutable completed records transactionally.
4. Add idempotent execution records and server-generated IDs.
5. Keep provider credentials out of run payloads.
6. Add distributed limits, cost reservations, and egress controls before real services.
7. Test cold starts, concurrency, duplicate writes, and tenant isolation.

These are future requirements, not implemented capabilities.
