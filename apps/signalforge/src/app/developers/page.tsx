import Link from "next/link";
export const metadata = { title: "Demo planning API & MCP" };
const curl = `curl https://signalforge-rose-two.vercel.app/api/v1/routes/plan \\\n+  -H 'Content-Type: application/json' \\\n+  -d '{"objective":"Build a route to extract and validate structured company data from a website","contextUrl":"https://example.com","budgetUsd":0.25,"optimizationPolicy":"best_value","mode":"demo"}'`;
export default function Page() {
  return (
    <article className="developers network-page container">
      <p className="eyebrow">SIGNALFORGE / DEVELOPER INTERFACE</p>
      <h1>
        Give your agent
        <br />a better route.
      </h1>
      <p className="network-intro">
        A public discovery and demo planning API. No marketplace writes, service
        execution, or payments. Every contract states execution_not_enabled.
      </p>
      <section>
        <h2>Plan across capabilities</h2>
        <Link className="text-link" href="/developers/try">
          Send a real REST or MCP planning request →
        </Link>
        <pre>{curl}</pre>
        <p>
          Returns ObjectiveFrame, ExecutionRouteContract, decompositionSource,
          observed supply, freshnessSummary, warnings, and executionStatus. Groq
          may decompose the objective; deterministic code selects the demo
          route.
        </p>
        <p>
          Unknown prices and catalog-only offers do not become executable steps.
          A budget that cannot cover critical capabilities yields a partial
          contract.
        </p>
      </section>
      <section>
        <h2>Inspect the supply network</h2>
        <ul>
          <li>
            GET /api/v1/catalog — capability, source, listingType, freshness,
            actionability, priceModel, maxPriceUsd, query, limit (1–50).
          </li>
          <li>
            GET /api/v1/catalog/&#123;id&#125; — an ID returned by the current
            catalog.
          </li>
          <li>
            POST /api/v1/opportunities/evaluate — opportunityId and
            agentProfile: default_demo_profile.
          </li>
          <li>
            GET /api/v1/network/status — connector health, observation times,
            and cache mode.
          </li>
        </ul>
        <pre>{`curl 'https://signalforge-rose-two.vercel.app/api/v1/catalog?capability=news_search&limit=10'`}</pre>
        <p>
          Catalog queries filter a bounded cached sample; they never trigger
          arbitrary upstream searches or follow listing URLs. No cursor
          pagination is exposed.
        </p>
      </section>
      <section>
        <h2>MCP, over HTTP</h2>
        <p>
          Connect an MCP client supporting Streamable HTTP to{" "}
          <code>https://signalforge-rose-two.vercel.app/api/mcp</code>.
          Stateless JSON responses, no standalone SSE, no resumable tasks, no
          authentication or action tools.
        </p>
        <pre>{`{"mcpServers":{"signalforge":{"type":"http","url":"https://signalforge-rose-two.vercel.app/api/mcp"}}}`}</pre>
        <ul>
          <li>signalforge_plan_route</li>
          <li>signalforge_search_catalog</li>
          <li>signalforge_get_listing</li>
          <li>signalforge_evaluate_opportunity</li>
        </ul>
        <p>
          Tool fields use snake_case: objective, context_url, budget_usd,
          optimization_policy; catalog search accepts capability, query,
          listing_type, max_price_usd, freshness, limit.
        </p>
      </section>
      <section>
        <h2>Limits & boundaries</h2>
        <p>
          Planning: 10 requests per client key per 10 minutes. Catalog and MCP
          protocol requests: 60 per 10 minutes. MCP planning also consumes
          planning quota. HTTP 429 includes Retry-After.
        </p>
        <p>
          Configured Upstash enables shared quotas and snapshots. Without it,
          this public demo uses conservative per-instance limits and a
          non-durable cache—not distributed abuse protection. Invalid shared
          configuration fails closed.
        </p>
        <p>
          Same-origin browser requests only; non-browser API/MCP clients need no
          cookies or credentials. Bodies are limited to 16 KiB; objectives to
          2,000 characters. No visitor objectives or keys are persisted.
        </p>
        <p>
          Discovery snapshots refresh at most hourly per source/cache instance.
          Cached observations retain timestamps; unavailable sources do not
          become simulated live data.
        </p>
      </section>
      <section>
        <h2>Discoverability, honestly</h2>
        <Link className="text-link" href="/.well-known/agent-card.json">
          Inspect the Agent Card →
        </Link>
        <p>
          A2A-style discoverability, using the 1.0 field vocabulary. No A2A
          message/task transport is advertised or implemented; use the REST or
          MCP interface. No legacy plugin manifest.
        </p>
      </section>
      <Link href="/network" className="text-link">
        Inspect live catalog observations →
      </Link>
    </article>
  );
}
