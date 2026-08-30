"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useResearchSession } from "./session";
import { Reveal } from "./motion";
import { EmptyRun, money } from "./ui";
import { policyLabels } from "@/domain/engine";
import {
  ExecutionRouteContractSchema,
  type ExecutionRouteContract,
} from "@/domain/route-planner";

function Sequence({ route }: { route: ExecutionRouteContract }) {
  return (
    <div className="capability-sequence">
      {route.route.map((step) => (
        <article className="plan-step" key={step.step} data-reveal>
          <span className="eyebrow">
            {String(step.step).padStart(2, "0")} /{" "}
            {step.capability.replaceAll("_", " ")}
          </span>
          <h2>{step.selectedProvider.name}</h2>
          <p>{step.rationale}</p>
          <div className="provider-stats">
            <span>
              Modeled cost / call
              <b>{money(step.selectedProvider.estimatedCostUsd)}</b>
            </span>
            <span>
              Modeled latency
              <b>{step.selectedProvider.estimatedLatencySeconds}s</b>
            </span>
            <span>
              Fixture reliability
              <b>{Math.round(step.selectedProvider.reliabilityScore * 100)}%</b>
            </span>
            <span>
              Verification role
              <b>
                {step.verificationRequired
                  ? "Required, not performed"
                  : "No result claimed"}
              </b>
            </span>
          </div>
          <details>
            <summary>Inputs, dependencies & fallback</summary>
            <p>{step.inputContract}</p>
            <p>{step.outputContract}</p>
            <p className="field-help">
              Dependencies: {step.dependencies.join(" → ") || "objective"}
            </p>
            <p>
              Fallback:{" "}
              {step.fallbackProvider?.name ??
                "No eligible replacement within these constraints."}
            </p>
            {step.fallbackProvider && (
              <p className="field-help">{step.fallbackProvider.reason}</p>
            )}
          </details>
        </article>
      ))}
      {!route.route.length && (
        <p>
          No capability can fit the current constraints. Raise the budget or
          narrow the objective; nothing will execute.
        </p>
      )}
    </div>
  );
}
function Constraints({ route }: { route: ExecutionRouteContract }) {
  return (
    <aside className="route-constraints">
      <p className="eyebrow">ROUTE RECEIPT / MODELED</p>
      <dl>
        <div>
          <dt>Hard cap{route.monitoringSpec ? " / month" : ""}</dt>
          <dd>{money(route.budget.hardCapUsd)}</dd>
        </div>
        <div>
          <dt>Projected route cost{route.monitoringSpec ? " / month" : ""}</dt>
          <dd>{money(route.budget.estimatedRouteCostUsd)}</dd>
        </div>
        <div>
          <dt>Actual service spend</dt>
          <dd>$0.00</dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd>
            {policyLabels[route.objectiveFrame.constraints.optimizationPolicy]}
          </dd>
        </div>
        <div>
          <dt>Expected duration / run</dt>
          <dd>
            {route.route
              .reduce(
                (n, s) => n + s.selectedProvider.estimatedLatencySeconds,
                0,
              )
              .toFixed(1)}
            s modeled
          </dd>
        </div>
        <div>
          <dt>Verification standard</dt>
          <dd>{route.verificationPolicy.standard.replaceAll("_", " ")}</dd>
        </div>
      </dl>
      <p className="field-help">
        All provider prices, latency, reliability and quality are authored
        fixtures. No vendor performance has been measured. Optional
        decomposition is separate from actual service spend.
      </p>
      {route.monitoringSpec && (
        <>
          <p className="eyebrow">MONITORING SPEC · NOT ACTIVE</p>
          <p>
            Every {route.monitoringSpec.intervalHours} hours ·{" "}
            {route.monitoringSpec.executionsPerMonth} runs/month
          </p>
          <p>{route.monitoringSpec.alertThreshold}</p>
          <p>
            {money(route.monitoringSpec.estimatedPerRunCostUsd)} modeled per
            run. Scheduler disabled.
          </p>
        </>
      )}
    </aside>
  );
}
function Rejections({ route }: { route: ExecutionRouteContract }) {
  return (
    <details className="route-ledger">
      <summary>
        Alternatives not selected ·{" "}
        {
          route.rejectedAlternatives.filter(
            (r) => r.reason !== "capability_mismatch",
          ).length
        }
      </summary>
      {route.rejectedAlternatives
        .filter((r) => r.reason !== "capability_mismatch")
        .map((r, i) => (
          <div key={i}>
            <span className="eyebrow">
              {r.capability} / {r.providerId}
            </span>
            <p>REJECTED / {r.reason.replaceAll("_", " ")}</p>
            <p className="field-help">{r.explanation}</p>
          </div>
        ))}
    </details>
  );
}
function Supply({ route }: { route: ExecutionRouteContract }) {
  return (
    <section className="route-ledger">
      <h2>Observed Catalog Options</h2>
      <p>
        Capability-matched catalog observations, separate from the simulated
        demo providers selected above. These options were not called or paid.
      </p>
      {route.observedSupply.length ? (
        route.observedSupply.map((l) => (
          <div key={l.id}>
            <a
              className="text-link"
              href={l.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {l.name} ↗
            </a>
            <p className="eyebrow">
              {l.sourceName} · {l.freshness.replaceAll("_", " ")} ·{" "}
              {l.observedAt}
            </p>
            <p className="eyebrow">{l.boundaryLabel}</p>
            <p className="field-help">
              {l.accessMode.replaceAll("_", " ")} /{" "}
              {l.actionability.replaceAll("_", " ")}
              {l.pricing.rawPriceText
                ? ` · ${l.pricing.rawPriceText}`
                : " · Task price not established"}
              {` · Price confidence: ${l.pricing.parseConfidence}`}
            </p>
            <p className="field-help">{l.reason}</p>
          </div>
        ))
      ) : (
        <p className="field-help">
          No eligible observed catalog matches attached. Seeded routes do not
          imply a live observation.
        </p>
      )}
      <Link href="/network" className="text-link">
        Inspect the live agent network →
      </Link>
    </section>
  );
}
export function RouteCompetition({ id }: { id: string }) {
  const { routes, saveRoute } = useResearchSession(),
    router = useRouter();
  const route = routes.find((r) => r.routeId === id);
  if (!route) return <EmptyRun />;
  return (
    <Reveal className="workspace container">
      <header className="workspace-title" data-reveal>
        <p className="eyebrow">
          OBJECTIVE → CAPABILITIES → SERVICE COMPETITION
        </p>
        <h1>Capability route</h1>
        <p>{route.objective}</p>
        <p className="route-boundary">DEMO PLANNING · EXECUTION NOT ENABLED</p>
      </header>
      <div className="execution-layout">
        <div>
          <Sequence route={route} />
          {route.unmetRequirements.length > 0 && (
            <section className="route-warning">
              <h2>Partial route / constraints not met</h2>
              {route.unmetRequirements.map((r) => (
                <p key={r}>{r}</p>
              ))}
            </section>
          )}
          <Rejections route={route} />
          <Supply route={route} />
          <div className="run-action">
            <button
              className="button"
              onClick={() => {
                saveRoute(
                  ExecutionRouteContractSchema.parse({
                    ...route,
                    status:
                      route.status === "partial" ? "partial" : "simulated",
                  }),
                );
                router.push(`/forge/${id}`);
              }}
            >
              {route.status === "partial"
                ? "Inspect partial contract"
                : "Simulate route"}
              <ArrowRight size={18} />
            </button>
            <p className="field-help">
              Local contract-state simulation only. No provider method is
              invoked, no evidence is created, and no external action occurs.
            </p>
          </div>
        </div>
        <Constraints route={route} />
      </div>
    </Reveal>
  );
}
function downloadContract(route: ExecutionRouteContract) {
  const value = ExecutionRouteContractSchema.parse(route),
    url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
  const a = document.createElement("a");
  a.href = url;
  a.download = `signalforge-${route.routeId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function IntegrationActions({ route }: { route: ExecutionRouteContract }) {
  const [message, setMessage] = useState("");
  const payload = {
    objective: route.objective,
    budgetUsd: route.budget.hardCapUsd,
    optimizationPolicy: route.objectiveFrame.constraints.optimizationPolicy,
    mode: "demo",
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setMessage("API payload copied. Review the objective before sharing.");
    } catch {
      setMessage("Copy unavailable; select the payload below.");
    }
  }
  return (
    <section className="route-ledger">
      <h2>Inspect with another agent</h2>
      <div className="network-actions">
        <button className="text-link" onClick={copy}>
          Copy API payload
        </button>
        <Link href="/developers/try" className="text-link">
          Try REST & MCP →
        </Link>
      </div>
      <details>
        <summary>Planning API payload / MCP connection</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
        <p>Connect an MCP client or Inspector using Streamable HTTP:</p>
        <code>https://signalforge-rose-two.vercel.app/api/mcp</code>
        <p>
          Tool: signalforge_plan_route. Inputs: objective, budget_usd,
          optimization_policy. Planning only, not execution permission.
        </p>
      </details>
      <p role="status">{message}</p>
    </section>
  );
}
export function ExecutionRouteView({ id }: { id: string }) {
  const { routes } = useResearchSession(),
    route = routes.find((r) => r.routeId === id);
  if (!route) return <EmptyRun />;
  return (
    <Reveal className="workspace container execution-report">
      <header className="workspace-title" data-reveal>
        <p className="eyebrow">
          SIGNALFORGE / EXECUTION ROUTE /{" "}
          {id.startsWith("example") ? id.replace("example-", "00") : "SESSION"}
        </p>
        <h1>Agent-ready execution route</h1>
        <h2>{route.objectiveFrame.title}</h2>
        <p>{route.objective}</p>
        <p className="route-boundary">
          {route.status.toUpperCase()} · DEMO · execution_not_enabled
        </p>
      </header>
      <div className="execution-layout">
        <article>
          <Sequence route={route} />
          {route.unmetRequirements.length > 0 && (
            <section className="route-warning">
              <h2>Unmet requirements</h2>
              {route.unmetRequirements.map((r) => (
                <p key={r}>{r}</p>
              ))}
            </section>
          )}
          <section className="handoff">
            <p className="eyebrow">CONTRACT / NOT AUTHORIZATION</p>
            <h2>Agent handoff</h2>
            <p>
              This route can be inspected by an external agent. Execution is not
              enabled. A future authorized implementation would need to:
            </p>
            <ol>
              <li>Execute steps in dependency order.</li>
              <li>Never exceed the hard budget, including failed calls.</li>
              <li>
                Replan before a fallback; do not assume failed calls were free.
              </li>
              <li>Require independent corroboration where specified.</li>
              <li>Stop when evidence or other constraints cannot be met.</li>
            </ol>
            <h3>Stop conditions</h3>
            <ul>
              {route.stopConditions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
          <Rejections route={route} />
          <Supply route={route} />
          <IntegrationActions route={route} />
          <section className="route-ledger">
            <h2>Example output: research brief</h2>
            <p>
              A separate fictional research case shows what an authorized route
              might produce. It was not generated by this route, and it is not
              evidence of service execution.
            </p>
            <Link className="text-link" href="/forge/example-1/output">
              Inspect simulated execution output →
            </Link>
          </section>
          <div className="export-actions">
            <button
              className="text-link"
              onClick={() => downloadContract(route)}
            >
              <Download size={16} /> Download route contract JSON
            </button>
            <Link href="/forge" className="text-link">
              Forge another route →
            </Link>
          </div>
          <p className="field-help">
            The export includes your objective. Review before sharing. New
            routes clear on reload; there is no persistent visitor archive.
          </p>
        </article>
        <Constraints route={route} />
      </div>
    </Reveal>
  );
}
export function RouteArchive() {
  const { routes } = useResearchSession();
  return (
    <section className="history-page container">
      <p className="eyebrow">CAPABILITY ROUTES / SESSION INDEX</p>
      <div className="history-heading">
        <div>
          <h1>Archive</h1>
          <p>
            Seeded route examples and this session’s contracts. Not execution
            history.
          </p>
        </div>
        <Link className="text-link" href="/forge">
          Forge route →
        </Link>
      </div>
      <div className="route-archive">
        {routes.map((r) => (
          <Link
            href={`/forge/${r.routeId}`}
            className="route-archive-row"
            key={r.routeId}
          >
            <span className="eyebrow">{r.createdAt.slice(0, 10)}</span>
            <div>
              <h2>{r.objectiveFrame.title}</h2>
              <p>
                {r.route.length} capability steps ·{" "}
                {r.provenance.isSimulated ? "simulated" : ""} · no services
                called
              </p>
            </div>
            <span>
              {policyLabels[r.objectiveFrame.constraints.optimizationPolicy]}
            </span>
            <span>
              {money(r.budget.estimatedRouteCostUsd)} modeled
              <br />
              $0 actual
            </span>
            <span className="eyebrow">{r.status} ↗</span>
          </Link>
        ))}
      </div>
      <p className="field-help">
        Example routes are controlled fixtures, not customer activity. Session
        routes disappear on reload.
      </p>
    </section>
  );
}
