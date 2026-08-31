"use client";
import { useCopy } from "@/i18n/copy";

import Link from "@/i18n/navigation";
import { useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useResearchSession } from "./session";
import { Reveal } from "./motion";
import { EmptyRun, money } from "./ui";
import { policyLabels } from "@/domain/engine";
import { RouteFlow } from "./interactions/route-flow";
import {
  ExecutionRouteContractSchema,
  type ExecutionRouteContract,
} from "@/domain/route-planner";

function Sequence({ route }: { route: ExecutionRouteContract }) {
  const t = useCopy();

  return (
    <div className="capability-sequence">
      {route.route.map((step) => (
        <article className="plan-step" key={step.step} data-reveal>
          <span className="eyebrow">
            {String(step.step).padStart(2, "0")} /{" "}
            {t(step.capability.replaceAll("_", " "))}
          </span>
          <h2>{t(step.selectedProvider.name)}</h2>
          <p>{t(step.rationale)}</p>
          <div className="provider-stats">
            <span>
              {t("Modeled cost / call")}
              <b>{money(step.selectedProvider.estimatedCostUsd)}</b>
            </span>
            <span>
              {t("Modeled latency")}
              <b>
                {t(step.selectedProvider.estimatedLatencySeconds)}
                {t("s")}
              </b>
            </span>
            <span>
              {t("Fixture reliability")}
              <b>{Math.round(step.selectedProvider.reliabilityScore * 100)}%</b>
            </span>
            <span>
              {t("Verification role")}
              <b>
                {t(
                  step.verificationRequired
                    ? "Required, not performed"
                    : "No result claimed",
                )}
              </b>
            </span>
          </div>
          <details>
            <summary>{t("Inputs, dependencies & fallback")}</summary>
            <p>{t(step.inputContract)}</p>
            <p>{t(step.outputContract)}</p>
            <p className="field-help">
              {t("Dependencies:")}
              {step.dependencies.join(" → ") || "objective"}
            </p>
            <p>
              {t("Fallback:")}{" "}
              {t(
                step.fallbackProvider?.name ??
                  "No eligible replacement within these constraints.",
              )}
            </p>
            {step.fallbackProvider && (
              <p className="field-help">{t(step.fallbackProvider.reason)}</p>
            )}
          </details>
        </article>
      ))}
      {!route.route.length && (
        <p>
          {t(
            "No capability can fit the current constraints. Raise the budget or narrow the objective; nothing will execute.",
          )}
        </p>
      )}
    </div>
  );
}
function Constraints({ route }: { route: ExecutionRouteContract }) {
  const t = useCopy();

  return (
    <aside className="route-constraints">
      <p className="eyebrow">{t("ROUTE RECEIPT / MODELED")}</p>
      <dl>
        <div>
          <dt>
            {t("Hard cap")}
            {t(route.monitoringSpec ? " / month" : "")}
          </dt>
          <dd>{money(route.budget.hardCapUsd)}</dd>
        </div>
        <div>
          <dt>
            {t("Projected route cost")}
            {t(route.monitoringSpec ? " / month" : "")}
          </dt>
          <dd>{money(route.budget.estimatedRouteCostUsd)}</dd>
        </div>
        <div>
          <dt>{t("Actual service spend")}</dt>
          <dd>$0.00</dd>
        </div>
        <div>
          <dt>{t("Policy")}</dt>
          <dd>
            {t(
              policyLabels[route.objectiveFrame.constraints.optimizationPolicy],
            )}
          </dd>
        </div>
        <div>
          <dt>{t("Expected duration / run")}</dt>
          <dd>
            {route.route
              .reduce(
                (n, s) => n + s.selectedProvider.estimatedLatencySeconds,
                0,
              )
              .toFixed(1)}
            {t("s modeled")}
          </dd>
        </div>
        <div>
          <dt>{t("Verification standard")}</dt>
          <dd>{t(route.verificationPolicy.standard.replaceAll("_", " "))}</dd>
        </div>
      </dl>
      <p className="field-help">
        {t(
          "All provider prices, latency, reliability and quality are authored fixtures. No vendor performance has been measured. Optional decomposition is separate from actual service spend.",
        )}
      </p>
      {route.monitoringSpec && (
        <>
          <p className="eyebrow">{t("MONITORING SPEC · NOT ACTIVE")}</p>
          <p>
            {t("Every")}
            {t(route.monitoringSpec.intervalHours)} {t("hours ·")}{" "}
            {t(route.monitoringSpec.executionsPerMonth)} {t("runs/month")}
          </p>
          <p>{t(route.monitoringSpec.alertThreshold)}</p>
          <p>
            {money(route.monitoringSpec.estimatedPerRunCostUsd)}{" "}
            {t("modeled per run. Scheduler disabled.")}
          </p>
        </>
      )}
    </aside>
  );
}
function Rejections({ route }: { route: ExecutionRouteContract }) {
  const t = useCopy();

  return (
    <details className="route-ledger">
      <summary>
        {t("Alternatives not selected ·")}{" "}
        {t(
          route.rejectedAlternatives.filter(
            (r) => r.reason !== "capability_mismatch",
          ).length,
        )}
      </summary>
      {route.rejectedAlternatives
        .filter((r) => r.reason !== "capability_mismatch")
        .map((r, i) => (
          <div key={i}>
            <span className="eyebrow">
              {t(r.capability)} / {t(r.providerId)}
            </span>
            <p>
              {t("REJECTED /")} {r.reason.replaceAll("_", " ")}
            </p>
            <p className="field-help">{t(r.explanation)}</p>
          </div>
        ))}
    </details>
  );
}
function Supply({ route }: { route: ExecutionRouteContract }) {
  const t = useCopy();

  return (
    <section className="route-ledger">
      <h2>{t("Observed Catalog Options")}</h2>
      <p>
        {t(
          "Capability-matched catalog observations, separate from the simulated demo providers selected above. These options were not called or paid.",
        )}
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
              {t(l.name)} ↗
            </a>
            <p className="eyebrow">
              {t(l.sourceName)} · {l.freshness.replaceAll("_", " ")} ·{" "}
              {l.observedAt}
            </p>
            <p className="eyebrow">{t(l.boundaryLabel)}</p>
            <p className="field-help">
              {l.accessMode.replaceAll("_", " ")} /{" "}
              {l.actionability.replaceAll("_", " ")}
              {t(
                l.pricing.rawPriceText
                  ? ` · ${l.pricing.rawPriceText}`
                  : " · Task price not established",
              )}
              {` · Price confidence: ${l.pricing.parseConfidence}`}
            </p>
            <p className="field-help">{t(l.reason)}</p>
          </div>
        ))
      ) : (
        <p className="field-help">
          {t(
            "No eligible observed catalog matches attached. Seeded routes do not imply a live observation.",
          )}
        </p>
      )}
      <Link href="/network" className="text-link">
        {t("Inspect the live agent network →")}
      </Link>
    </section>
  );
}
export function RouteCompetition({ id }: { id: string }) {
  const t = useCopy();

  const { routes, saveRoute } = useResearchSession(),
    router = useRouter();
  const route = routes.find((r) => r.routeId === id);
  if (!route) return <EmptyRun />;
  return (
    <Reveal className="workspace container">
      <header className="workspace-title" data-reveal>
        <p className="eyebrow">
          {t("OBJECTIVE → CAPABILITIES → SERVICE COMPETITION")}
        </p>
        <h1>{t("Capability route")}</h1>
        <p>{route.objective}</p>
        <p className="route-boundary">
          {t("DEMO PLANNING · EXECUTION NOT ENABLED")}
          {" · "}
          <code>{route.executionStatus}</code>
        </p>
      </header>
      <div className="execution-layout">
        <div>
          <Sequence route={route} />
          {route.unmetRequirements.length > 0 && (
            <section className="route-warning">
              <h2>{t("Partial route / constraints not met")}</h2>
              {route.unmetRequirements.map((r) => (
                <p key={r}>{t(r)}</p>
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
                      route.executionMode === "planning_only"
                        ? route.status
                        : route.status === "partial"
                          ? "partial"
                          : "simulated",
                  }),
                );
                router.push(`/forge/${id}`);
              }}
            >
              {t(
                route.status === "partial"
                  ? "Inspect partial contract"
                  : "Simulate route",
              )}
              <ArrowRight size={18} />
            </button>
            <p className="field-help">
              {t(
                "Local contract-state simulation only. No provider method is invoked, no evidence is created, and no external action occurs.",
              )}
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
  const t = useCopy();

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
      <h2>{t("Inspect with another agent")}</h2>
      <div className="network-actions">
        <button className="text-link" onClick={copy}>
          {t("Copy API payload")}
        </button>
        <Link href="/developers/try" className="text-link">
          {t("Try REST & MCP →")}
        </Link>
      </div>
      <details>
        <summary>{t("Planning API payload / MCP connection")}</summary>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
        <p>{t("Connect an MCP client or Inspector using Streamable HTTP:")}</p>
        <code>https://signalforge-rose-two.vercel.app/api/mcp</code>
        <p>
          {t(
            "Tool: signalforge_plan_route. Inputs: objective, budget_usd, optimization_policy. Planning only, not execution permission.",
          )}
        </p>
      </details>
      <p role="status">{t(message)}</p>
    </section>
  );
}
export function ExecutionRouteView({ id }: { id: string }) {
  const t = useCopy();

  const { routes } = useResearchSession(),
    route = routes.find((r) => r.routeId === id);
  if (!route) return <EmptyRun />;
  return (
    <Reveal className="workspace container execution-report">
      <header className="workspace-title" data-reveal>
        <p className="eyebrow">
          {t("SIGNALFORGE / EXECUTION ROUTE /")}{" "}
          {t(
            id.startsWith("example") ? id.replace("example-", "00") : "SESSION",
          )}
        </p>
        <h1>{t("Agent-ready execution route")}</h1>
        <h2>{route.objectiveFrame.title}</h2>
        <p>{route.objective}</p>
        <p className="route-boundary">
          {route.status.toUpperCase()} {t("· DEMO · execution_not_enabled")}
        </p>
      </header>
      <RouteFlow route={route} />
      <div className="execution-layout">
        <article>
          <Sequence route={route} />
          {route.unmetRequirements.length > 0 && (
            <section className="route-warning">
              <h2>{t("Unmet requirements")}</h2>
              {route.unmetRequirements.map((r) => (
                <p key={r}>{t(r)}</p>
              ))}
            </section>
          )}
          <section className="handoff">
            <p className="eyebrow">{t("CONTRACT / NOT AUTHORIZATION")}</p>
            <h2>{t("Agent handoff")}</h2>
            <p>
              {t(
                "This route can be inspected by an external agent. Execution is not enabled. A future authorized implementation would need to:",
              )}
            </p>
            <ol>
              <li>{t("Execute steps in dependency order.")}</li>
              <li>
                {t("Never exceed the hard budget, including failed calls.")}
              </li>
              <li>
                {t(
                  "Replan before a fallback; do not assume failed calls were free.",
                )}
              </li>
              <li>{t("Require independent corroboration where specified.")}</li>
              <li>
                {t("Stop when evidence or other constraints cannot be met.")}
              </li>
            </ol>
            <h3>{t("Stop conditions")}</h3>
            <ul>
              {route.stopConditions.map((s) => (
                <li key={s}>{t(s)}</li>
              ))}
            </ul>
          </section>
          <Rejections route={route} />
          <Supply route={route} />
          <IntegrationActions route={route} />
          {route.executionMode === "demo_simulation" && (
            <section className="route-ledger">
              <h2>{t("Example output: research brief")}</h2>
              <p>
                {t(
                  "A separate fictional research case shows what an authorized route might produce. It was not generated by this route, and it is not evidence of service execution.",
                )}
              </p>
              <Link className="text-link" href="/forge/example-1/output">
                {t("Inspect simulated execution output →")}
              </Link>
            </section>
          )}
          <div className="export-actions">
            <button
              className="text-link"
              onClick={() => downloadContract(route)}
            >
              <Download size={16} /> {t("Download route contract JSON")}
            </button>
            <Link href="/forge" className="text-link">
              {t("Forge another route →")}
            </Link>
          </div>
          <p className="field-help">
            {t(
              "The export includes your objective. Review before sharing. New routes clear on reload; there is no persistent visitor archive.",
            )}
          </p>
        </article>
        <Constraints route={route} />
      </div>
    </Reveal>
  );
}
export function RouteArchive() {
  const t = useCopy();

  const { routes } = useResearchSession();
  return (
    <section className="history-page container">
      <p className="eyebrow">{t("CAPABILITY ROUTES / SESSION INDEX")}</p>
      <div className="history-heading">
        <div>
          <h1>{t("Archive")}</h1>
          <p>
            {t(
              "Seeded route examples and this session’s contracts. Not execution history.",
            )}
          </p>
        </div>
        <Link className="text-link" href="/forge">
          {t("Forge route →")}
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
              <h2>{t(r.objectiveFrame.title)}</h2>
              <p>
                {t(r.route.length)} {t("capability steps ·")}{" "}
                {t(r.provenance.isSimulated ? "simulated" : "")}{" "}
                {t("· no services called")}
              </p>
            </div>
            <span>
              {t(policyLabels[r.objectiveFrame.constraints.optimizationPolicy])}
            </span>
            <span>
              {money(r.budget.estimatedRouteCostUsd)} {t("modeled")}
              <br />
              {t("$0 actual")}
            </span>
            <span className="eyebrow">{t(r.status)} ↗</span>
          </Link>
        ))}
      </div>
      <p className="field-help">
        {t(
          "Example routes are controlled fixtures, not customer activity. Session routes disappear on reload.",
        )}
      </p>
    </section>
  );
}
