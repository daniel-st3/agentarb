"use client";
import { useMemo, useState } from "react";
import { m, AnimatePresence, useReducedMotion } from "motion/react";
import Link from "@/i18n/navigation";
import { useCopy } from "@/i18n/copy";
import { useLocale } from "next-intl";
import {
  ArbitragePolicySchema,
  evaluateArbitrage,
  compareEvaluations,
  type ArbitrageEvaluation,
  type ArbitragePolicy,
} from "@/domain/arbitrage";
import { arbitrageLab, findLab } from "@/domain/arbitrage-lab";
import type { NetworkResponse, TaskOpportunity } from "@/domain/intelligence";
import { ArrowUpRight, Download } from "lucide-react";
import { Sensitivity } from "./sensitivity";
const reasons: Record<string, string> = {
  policy_satisfied: "All economic policy thresholds are satisfied.",
  negative_spread: "Fulfillment costs exceed the payout.",
  capital_limit: "Maximum capital at risk exceeded.",
  success_below_policy: "Scenario probability is below policy.",
  negative_risk_adjusted_value: "Risk-adjusted value is negative.",
  profit_below_policy: "Profit is below the configured minimum.",
  margin_below_policy: "Margin is below the configured minimum.",
  break_even_only: "Break-even only; there is no positive spread.",
  economic_inputs_missing: "Economic inputs are incomplete.",
  critical_capability_missing: "A critical capability cannot be routed.",
  payout_unknown: "Structured payout is unavailable.",
  task_cost_unavailable: "Catalog unit prices are not task-specific costs.",
  platform_fee_unknown: "Platform fees have not been established.",
  failure_exposure_unknown: "Failure exposure has not been established.",
  execution_eligibility_unknown:
    "Marketplace eligibility has not been established.",
  success_probability_unknown: "Acceptance probability is unknown.",
  freshness_disallowed: "Freshness is outside the policy.",
  source_mode_disallowed: "Source mode is outside the policy.",
  confidence_disallowed: "Economic confidence is outside the policy.",
};
const decisionLabels: Record<string, string> = {
  profitable: "PROFITABLE",
  marginal: "MARGINAL",
  uneconomic: "UNECONOMIC",
  unroutable: "UNROUTABLE",
  insufficient_data: "INSUFFICIENT DATA",
};
export function ArbitrageWorkbench({
  network,
  initialMode = "lab",
  selectedId,
}: {
  network: Pick<NetworkResponse, "records">;
  initialMode?: "lab" | "observed";
  selectedId?: string;
}) {
  const t = useCopy(),
    locale = useLocale(),
    reduce = useReducedMotion();
  const [mode, setMode] = useState(initialMode),
    [policy, setPolicy] = useState<ArbitragePolicy>(() =>
      ArbitragePolicySchema.parse({}),
    );
  const [selected, setSelected] = useState(selectedId ?? "lab:spread"),
    [payout, setPayout] = useState<number | undefined>(),
    [probability, setProbability] = useState<number | undefined>();
  const [previous, setPrevious] = useState<ArbitrageEvaluation | null>(null),
    [message, setMessage] = useState("");
  const [currentNetwork, setNetwork] = useState(network);
  const tasks =
    mode === "lab"
      ? arbitrageLab.map((f) => f.opportunity)
      : currentNetwork.records.filter(
          (l): l is TaskOpportunity =>
            l.listingType === "task_opportunity" &&
            ["live", "cached_live"].includes(l.freshness),
        );
  const rows = useMemo(
    () =>
      tasks
        .map((task) =>
          evaluateArbitrage(
            task,
            {
              opportunityId: task.id,
              responseVersion: "2.0",
              policy,
              scenario:
                task.id === selected &&
                (payout !== undefined || probability !== undefined)
                  ? { payoutCents: payout, successProbabilityBps: probability }
                  : undefined,
            },
            {
              lab: mode === "lab" ? findLab(task.id)?.specification : undefined,
              supply: currentNetwork.records.filter(
                (l) => l.listingType === "service_offer",
              ),
            },
          ),
        )
        .sort(compareEvaluations),
    [
      tasks,
      policy,
      selected,
      payout,
      probability,
      mode,
      currentNetwork.records,
    ],
  );
  const active = rows.find((r) => r.opportunityId === selected) ?? rows[0];
  const usd = (c: number | null | undefined) =>
    c == null
      ? t("Unknown")
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "USD",
        }).format(c / 100);
  const update = (values: Partial<ArbitragePolicy>) => {
    setPrevious(active ?? null);
    setPolicy((p) => ({ ...p, ...values }));
  };
  const observedCount = currentNetwork.records.filter(
    (l) =>
      l.listingType === "service_offer" &&
      ["live", "cached_live"].includes(l.freshness),
  ).length;
  async function exportReceipt() {
    if (!active) return;
    setMessage("");
    try {
      const r = await fetch("/api/v1/opportunities/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: active.opportunityId,
          responseVersion: "2.0",
          policy,
          scenario: active.scenario ?? undefined,
        }),
      });
      if (!r.ok) throw new Error();
      const receipt = await r.json();
      const blob = new Blob([JSON.stringify(receipt, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "signalforge-arbitrage-receipt.json";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Receipt compiled against the current network.");
    } catch {
      setMessage("Receipt unavailable. Please try again shortly.");
    }
  }
  async function refresh() {
    setMessage("");
    try {
      const r = await fetch("/api/v1/catalog?limit=50");
      if (!r.ok) throw new Error();
      const { NetworkResponseSchema } = await import("@/domain/intelligence");
      const { matchedCount: _, truncated: __, ...payload } = await r.json();
      void _;
      void __;
      setPrevious(active ?? null);
      setNetwork(NetworkResponseSchema.parse(payload));
      setMessage("Current bounded snapshot loaded.");
    } catch {
      setMessage(
        "Network refresh unavailable. The existing snapshot is unchanged.",
      );
    }
  }
  return (
    <div className="arb-workbench container">
      <header className="arb-heading">
        <p className="eyebrow">{t("SIGNALFORGE / ARBITRAGE RADAR")}</p>
        <h1>{t("Does the spread survive?")}</h1>
        <p>
          {t(
            "Compare fulfillment routes. Price the uncertainty. Keep the decision auditable.",
          )}
        </p>
      </header>
      <div className="arb-mode" role="group" aria-label={t("Economic mode")}>
        {(["lab", "observed"] as const).map((v) => (
          <button
            key={v}
            aria-pressed={mode === v}
            onClick={() => {
              setMode(v);
              setPrevious(null);
              setPayout(undefined);
              setProbability(undefined);
              setSelected(v === "lab" ? "lab:spread" : "");
              window.history.replaceState(
                null,
                "",
                window.location.pathname + "?mode=" + v,
              );
            }}
          >
            {t(v === "lab" ? "SIMULATED / ARBITRAGE LAB" : "OBSERVED")}
          </button>
        ))}
        <span>{t("Execution disabled")}</span>
      </div>
      <div className="arb-statline">
        <span>
          {observedCount} {t("supply observations")}
        </span>
        <span>
          {tasks.length} {t("task opportunities")}
        </span>
        <span>
          {
            rows.filter(
              (r) =>
                r.economics.expectedProfitCents !== null &&
                !["unroutable", "insufficient_data"].includes(r.decision),
            ).length
          }{" "}
          {t("underwritable scenarios")}
        </span>
        <span>
          {rows.filter((r) => r.decision === "profitable").length}{" "}
          {t("above policy threshold")}
        </span>
      </div>
      <div className="arb-policy" aria-label={t("Arbitrage policy")}>
        <label>
          {t("Minimum profit (cents)")}
          <input
            type="number"
            min="0"
            max="1000"
            value={policy.minimumExpectedProfitCents}
            onChange={(e) =>
              update({
                minimumExpectedProfitCents: Math.max(
                  0,
                  Math.min(1000, Math.trunc(Number(e.target.value))),
                ),
              })
            }
          />
        </label>
        <label>
          {t("Minimum margin")}
          <strong>{policy.minimumMarginBps / 100}%</strong>
          <input
            aria-label={t("Minimum margin")}
            type="range"
            min="0"
            max="10000"
            step="100"
            value={policy.minimumMarginBps}
            onChange={(e) =>
              update({ minimumMarginBps: Number(e.target.value) })
            }
          />
        </label>
        <label>
          {t("Maximum capital (cents)")}
          <input
            type="number"
            min="0"
            max="1000"
            value={policy.maximumCapitalAtRiskCents}
            onChange={(e) =>
              update({
                maximumCapitalAtRiskCents: Math.max(
                  0,
                  Math.min(1000, Math.trunc(Number(e.target.value))),
                ),
              })
            }
          />
        </label>
        <label>
          {t("Maximum route cost (cents)")}
          <input
            type="number"
            min="0"
            max="1000"
            value={policy.maximumRouteCostCents}
            onChange={(e) =>
              update({
                maximumRouteCostCents: Math.max(
                  0,
                  Math.min(1000, Math.trunc(Number(e.target.value))),
                ),
              })
            }
          />
        </label>
        <label>
          {t("Optimization")}
          <select
            value={policy.optimization}
            onChange={(e) =>
              update({
                optimization: e.target.value as ArbitragePolicy["optimization"],
              })
            }
          >
            {[
              ["max_profit", "Maximum profit"],
              ["risk_adjusted", "Risk-adjusted value"],
              ["lowest_cost", "Lowest cost"],
              ["highest_reliability", "Highest modeled reliability"],
              ["fastest", "Fastest"],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label className="arb-checkbox">
          <input
            type="checkbox"
            checked={policy.requireIndependentVerification}
            onChange={(e) =>
              update({ requireIndependentVerification: e.target.checked })
            }
          />
          {t("Require independent verification")}
        </label>
      </div>
      {!tasks.length ? (
        <section className="arb-empty">
          <h2>{t("No approved demand feed is connected.")}</h2>
          <p>
            {observedCount > 0
              ? t(
                  "Live supply observations are available. Paid task ingestion remains under review; no task or payout is fabricated.",
                )
              : t(
                  "Supply snapshots are unavailable. Paid task ingestion remains under review; no listing is fabricated.",
                )}
          </p>
          <p>
            {t(
              "Observed underwriting requires a structured payout, task-specific costs, fees, failure exposure and eligibility.",
            )}
          </p>
          <Link href="/network">
            {t("Inspect supply and source assessments")} ↗
          </Link>
        </section>
      ) : (
        <div
          className="arb-table"
          role="table"
          aria-label={t("Opportunity radar")}
        >
          <div className="arb-table-head" role="row">
            {[
              "Opportunity",
              "Payout",
              "Route cost",
              "Expected profit",
              "Margin",
              "Decision",
            ].map((s) => (
              <span role="columnheader" key={s}>
                {t(s)}
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <button
              role="row"
              className="arb-row"
              key={r.opportunityId}
              aria-label={`${t(r.opportunity.title)} · ${t(decisionLabels[r.decision])}`}
              aria-selected={active?.opportunityId === r.opportunityId}
              onClick={() => {
                setPrevious(null);
                setSelected(r.opportunityId);
                setPayout(undefined);
                setProbability(undefined);
              }}
            >
              <span role="cell">
                <b>{t(r.opportunity.title)}</b>
                <small>
                  {r.opportunity.sourceName} ·{" "}
                  {t(mode === "lab" ? "SIMULATED" : "OBSERVED")}
                  {" · "}
                  {t(
                    r.risk.confidence === "medium"
                      ? "Modeled confidence"
                      : "Unknown confidence",
                  )}
                </small>
              </span>
              <span role="cell">{usd(r.payout.amountCents)}</span>
              <span role="cell">{usd(r.economics.expectedTotalCostCents)}</span>
              <span role="cell">
                {r.decision === "unroutable"
                  ? "—"
                  : usd(r.economics.expectedProfitCents)}
              </span>
              <span role="cell">
                {r.decision === "unroutable" ||
                r.economics.expectedMarginBps === null
                  ? "—"
                  : `${r.economics.expectedMarginBps / 100}%`}
              </span>
              <span role="cell" className={`arb-decision ${r.decision}`}>
                {t(decisionLabels[r.decision])}
              </span>
            </button>
          ))}
        </div>
      )}
      {active && (
        <section
          className="arb-inspector"
          aria-label={t("Arbitrage inspector")}
        >
          <header>
            <p className="eyebrow">{t("DEMAND → SUPPLY → UNDERWRITING")}</p>
            <h2>{t(active.opportunity.title)}</h2>
            <p className="mono">
              {active.opportunityId} /{" "}
              {t(active.mode === "lab" ? "SIMULATED" : "OBSERVED")}
            </p>
          </header>
          <div className="arb-inspector-grid">
            <div>
              <h3>{t("Capability requirements")}</h3>
              <ol className="arb-chain">
                {active.capabilityCoverage.required.map((c, i) => (
                  <li key={c}>
                    <span>0{i + 1}</span>
                    {t(c.replaceAll("_", " "))}
                  </li>
                ))}
              </ol>
              <details>
                <summary>{t("Demand provenance and access")}</summary>
                <dl className="arb-receipt">
                  <dt>{t("Source")}</dt>
                  <dd>{active.opportunity.sourceName}</dd>
                  <dt>{t("Observed / authored at")}</dt>
                  <dd>{active.opportunity.observedAt}</dd>
                  <dt>{t("Deadline")}</dt>
                  <dd>{t(active.opportunity.deadline ?? "Unknown")}</dd>
                  <dt>{t("Claim model")}</dt>
                  <dd>{active.opportunity.claimModel}</dd>
                  <dt>{t("Settlement")}</dt>
                  <dd>{active.opportunity.settlement}</dd>
                  <dt>{t("Eligibility")}</dt>
                  <dd>{t("Unknown")}</dd>
                </dl>
                <a
                  href={active.opportunity.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t("Source reference")} ↗
                </a>
              </details>
              <h3>{t("Route competition")}</h3>
              <p>
                {t(
                  "Selected providers and reliability are modeled Lab traits, not vendor measurements.",
                )}
              </p>
              <div className="arb-competition" aria-live="polite">
                <AnimatePresence initial={false}>
                  {active.candidates.map((c) => (
                    <m.article
                      key={c.id}
                      layout={!reduce}
                      initial={false}
                      animate={{
                        opacity: c.decision === "unroutable" ? 0.55 : 1,
                      }}
                      transition={{ duration: reduce ? 0 : 0.2 }}
                      data-selected={active.selectedRouteId === c.id}
                    >
                      <div className="arb-route-title">
                        <b>
                          {t(
                            c.strategy === "cheapest"
                              ? "Lowest cost"
                              : c.strategy === "fastest"
                                ? "Fastest"
                                : "Independent verification",
                          )}
                        </b>
                        <span className={`arb-decision ${c.decision}`}>
                          {t(decisionLabels[c.decision])}
                        </span>
                      </div>
                      <ol>
                        {c.route.route.map((s) => (
                          <li key={s.step}>
                            <span>{t(s.capability.replaceAll("_", " "))}</span>
                            <b>{s.selectedProvider.name}</b>
                            <span>
                              {usd(
                                Math.round(
                                  s.selectedProvider.estimatedCostUsd * 100,
                                ),
                              )}
                            </span>
                            {s.fallbackProvider && (
                              <small>
                                {t("Fallback")}: {s.fallbackProvider.name}
                              </small>
                            )}
                          </li>
                        ))}
                      </ol>
                      <div className="arb-route-stats">
                        <span>
                          {t("Expected cost")}{" "}
                          {usd(c.economics.expectedTotalCostCents)}
                        </span>
                        <span>
                          {t("Modeled latency")} {c.latencySeconds.toFixed(1)} s
                        </span>
                        <span>
                          {t("Scenario reliability")} {c.reliabilityBps / 100}%
                        </span>
                      </div>
                      <p>
                        {c.reasons.map((r) => t(reasons[r] ?? r)).join(" ")}
                      </p>
                      <details>
                        <summary>{t("Alternatives not selected")}</summary>
                        {c.route.rejectedAlternatives.map((a, i) => (
                          <p key={i}>
                            <b>{a.providerId}</b> / {a.capability}
                            <br />
                            <code>{a.reason}</code> · {t(a.explanation)}
                          </p>
                        ))}
                      </details>
                    </m.article>
                  ))}
                </AnimatePresence>
              </div>
              <details>
                <summary>{t("Observed catalog options / not called")}</summary>
                {!active.supplyOptions.length ? (
                  <p>{t("No matching observed supply in this snapshot.")}</p>
                ) : (
                  active.supplyOptions.map((s) => (
                    <div className="arb-source" key={s.id}>
                      <b>{s.name}</b>
                      <span>
                        {s.source} / {s.freshness}
                      </span>
                      <p>{s.rawPriceText ?? t("Unknown unit price")}</p>
                      <p>
                        {s.accessMode} / {s.actionability}
                      </p>
                      <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                        {t("Source reference")} ↗
                      </a>
                      <small>
                        {s.observedAt} · {t("Task cost unknown")}
                      </small>
                    </div>
                  ))
                )}
              </details>
            </div>
            <aside className="arb-economics">
              <p className="eyebrow">{t("ECONOMICS / CONDITIONAL SPREAD")}</p>
              <h3>{t("Does it clear the policy?")}</h3>
              <dl className="arb-receipt">
                {[
                  ["Payout", active.payout.amountCents],
                  ["Execution route", active.economics.executionCostCents],
                  ["Verification", active.economics.verificationCostCents],
                  ["Platform fee", active.economics.platformCostCents],
                  [
                    "Expected failure reserve",
                    active.economics.expectedFailureCostCents,
                  ],
                  [
                    "Expected total cost",
                    active.economics.expectedTotalCostCents,
                  ],
                ].map(([label, n]) => (
                  <div key={String(label)}>
                    <dt>{t(String(label))}</dt>
                    <dd>{usd(n as number | null)}</dd>
                  </div>
                ))}
              </dl>
              <div className="arb-profit" aria-live="polite">
                <span>{t("Expected profit")}</span>
                <m.strong
                  key={active.economics.expectedProfitCents}
                  initial={reduce ? false : { opacity: 0.5, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {active.decision === "unroutable"
                    ? "—"
                    : usd(active.economics.expectedProfitCents)}
                </m.strong>
                <span className={`arb-decision ${active.decision}`}>
                  {t(decisionLabels[active.decision])}
                </span>
              </div>
              <p>
                {t(
                  "Conditional spread assumes the payout is received. It is not realized earnings or risk-adjusted value.",
                )}
              </p>
              <dl className="arb-receipt">
                <dt>{t("Risk-adjusted value")}</dt>
                <dd>{usd(active.economics.riskAdjustedExpectedValueCents)}</dd>
                <dt>{t("Capital at risk")}</dt>
                <dd>{usd(active.economics.capitalAtRiskCents)}</dd>
                <dt>{t("Break-even payout")}</dt>
                <dd>{usd(active.economics.breakEvenPayoutCents)}</dd>
                <dt>{t("Maximum fulfillment cost")}</dt>
                <dd>{usd(active.economics.maximumFulfillmentCostCents)}</dd>
                <dt>{t("Required success probability")}</dt>
                <dd>
                  {active.economics.requiredSuccessProbabilityBps === null
                    ? t("Unknown")
                    : `${active.economics.requiredSuccessProbabilityBps / 100}%`}
                </dd>
              </dl>
              <ul>
                {[...new Set([...active.reasons, ...active.missingInputs])].map(
                  (r) => (
                    <li key={r}>{t(reasons[r] ?? r)}</li>
                  ),
                )}
              </ul>
              <div className="arb-scenario">
                <h3>{t("Sensitivity / user scenario")}</h3>
                <label>
                  {t("Payout scenario (cents)")}
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={payout ?? ""}
                    placeholder={String(active.payout.amountCents ?? "")}
                    onChange={(e) => {
                      setPrevious(active);
                      setPayout(
                        e.target.value === ""
                          ? undefined
                          : Math.max(
                              0,
                              Math.min(
                                10000,
                                Math.trunc(Number(e.target.value)),
                              ),
                            ),
                      );
                    }}
                  />
                </label>
                <label>
                  {t("Success scenario (%)")}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder={
                      active.risk.successProbabilityBps === null
                        ? t("Unknown")
                        : String(active.risk.successProbabilityBps / 100)
                    }
                    value={probability === undefined ? "" : probability / 100}
                    onChange={(e) => {
                      setPrevious(active);
                      setProbability(
                        e.target.value === ""
                          ? undefined
                          : Math.max(
                              0,
                              Math.min(
                                10000,
                                Math.round(Number(e.target.value) * 100),
                              ),
                            ),
                      );
                    }}
                  />
                </label>
                <p>
                  {t(
                    active.risk.probabilityProvenance === "user_scenario"
                      ? "USER SCENARIO"
                      : active.risk.probabilityProvenance === "unknown"
                        ? "UNKNOWN"
                        : "SIMULATED",
                  )}
                </p>
              </div>
              {active.candidates[0] && (
                <figure className="arb-sensitivity">
                  <figcaption>
                    {t("Modeled cost band · −10% / base / +20% execution cost")}
                  </figcaption>
                  <svg
                    viewBox="0 0 300 60"
                    role="img"
                    aria-label={t("Cost sensitivity band")}
                  >
                    <line
                      x1="20"
                      x2="280"
                      y1="25"
                      y2="25"
                      stroke="currentColor"
                    />
                    {[20, 150, 280].map((x, i) => (
                      <circle
                        key={x}
                        cx={x}
                        cy="25"
                        r={i === 1 ? 6 : 3}
                        fill="currentColor"
                      />
                    ))}
                  </svg>
                  <div>
                    {["optimistic", "base", "conservative"].map((key) => (
                      <span key={key}>
                        {usd(
                          active.candidates[0].scenarioBands[key as "base"]
                            .expectedTotalCostCents,
                        )}
                      </span>
                    ))}
                  </div>
                </figure>
              )}
              <Sensitivity evaluation={active} />
            </aside>
          </div>
          {previous && (
            <div className="arb-diff" role="status">
              <b>{t("POLICY DIFF")}</b>
              <span>
                {t(decisionLabels[previous.decision])} →{" "}
                {t(decisionLabels[active.decision])}
              </span>
              <span>
                {usd(previous.economics.expectedProfitCents)} →{" "}
                {usd(active.economics.expectedProfitCents)}
              </span>
              <span>
                {t("Selected route")}:{" "}
                {JSON.stringify(previous.candidates[0]?.route.route) ===
                JSON.stringify(active.candidates[0]?.route.route)
                  ? t("Unchanged")
                  : t("Changed")}
              </span>
            </div>
          )}
          <footer className="arb-actions">
            <button onClick={exportReceipt}>
              <Download size={16} />
              {t("Download auditable receipt")}
            </button>
            <button onClick={refresh}>
              {t("Re-evaluate current network")}
              <ArrowUpRight size={16} />
            </button>
            <Link href="/developers/try">{t("Inspect REST / MCP")}</Link>
          </footer>
          <p role="status">{t(message)}</p>
          <details>
            <summary>{t("Agent handoff / JSON contract")}</summary>
            <p>
              {t(
                "Inspection only. No route, fallback or observed service is authorized to execute.",
              )}
            </p>
            <pre>{JSON.stringify(active, null, 2)}</pre>
          </details>
        </section>
      )}
      <p className="arb-boundary mono">
        {t("UNDERWRITING — DETERMINISTIC · EXECUTION — DISABLED")}
      </p>
    </div>
  );
}
