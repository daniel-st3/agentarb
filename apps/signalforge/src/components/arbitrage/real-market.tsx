"use client";
import { useEffect, useState } from "react";
import { useCopy } from "@/i18n/copy";
import Link from "@/i18n/navigation";
import {
  TaskOpportunitySchema,
  type TaskOpportunity,
} from "@/domain/intelligence";
import {
  ArbitrageEvaluationSchema,
  type ArbitrageEvaluation,
} from "@/domain/arbitrage";
import { z } from "zod";
export function atomicUsdc(value: string | null | undefined) {
  if (value == null) return "—";
  const n = BigInt(value),
    negative = n < 0n,
    abs = negative ? -n : n;
  const fraction = (abs % 1000000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${negative ? "−" : ""}${abs / 1000000n}${fraction ? `.${fraction}` : ""} USDC`;
}
const resultSchema = z.object({
  records: z.array(TaskOpportunitySchema).max(20),
  observedSupplyCount: z.number(),
  matchedCount: z.number().optional(),
  truncated: z.boolean().optional(),
});
export function RealMarket({
  initialTasks = [],
}: {
  initialTasks?: TaskOpportunity[];
}) {
  const t = useCopy(),
    [tasks, setTasks] = useState(initialTasks),
    [selected, setSelected] = useState<TaskOpportunity | undefined>(
      initialTasks[0],
    ),
    [evaluation, setEvaluation] = useState<ArbitrageEvaluation>(),
    [receiptHash, setReceiptHash] = useState(""),
    [snapshotTime, setSnapshotTime] = useState(0),
    [message, setMessage] = useState(""),
    [filters, setFilters] = useState({
      query: "",
      capability: "",
      reward: "",
      payment: "",
      deadline: "",
      decision: "",
      source: "",
    }),
    [minimumMargin, setMargin] = useState(2500),
    [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/v1/opportunities?mode=observed&limit=20", {
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return resultSchema.parse(await r.json());
      })
      .then((data) => {
        setSnapshotTime(Date.now());
        setTasks(data.records);
        setSelected(data.records[0]);
        setTruncated(data.truncated ?? false);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setMessage(
            "Market snapshot unavailable. Last known data is retained.",
          );
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setMessage("");
      fetch("/api/v1/opportunities/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          opportunityId: selected.id,
          responseVersion: "2.0",
          policy: { minimumMarginBps: minimumMargin },
        }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error();
          const receipt = z
            .object({
              evaluation: ArbitrageEvaluationSchema,
              receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
            })
            .parse(await r.json());
          setReceiptHash(receipt.receiptHash);
          return receipt.evaluation;
        })
        .then(setEvaluation)
        .catch(() => {
          if (!abort.signal.aborted)
            setMessage("Underwriting unavailable. Please try again shortly.");
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
      setEvaluation(undefined);
    };
  }, [selected, minimumMargin]);
  const visible = tasks.filter(
    (task) =>
      (!filters.query ||
        `${task.title} ${task.description}`
          .toLowerCase()
          .includes(filters.query.toLowerCase())) &&
      (!filters.capability ||
        task.requiredCapabilities.includes(filters.capability as never)) &&
      (!filters.payment ||
        task.demandState?.paymentState === filters.payment) &&
      (!filters.source || task.sourceId === filters.source) &&
      (!filters.reward ||
        BigInt(task.demandState?.reward?.amount ?? "0") >=
          BigInt(filters.reward)) &&
      (!filters.deadline ||
        (task.deadline && Date.parse(task.deadline) > snapshotTime)) &&
      (!filters.decision ||
        (task.demandState?.eligibility === "not_eligible"
          ? "unroutable"
          : "insufficient_data") === filters.decision),
  );
  const change = (key: keyof typeof filters, value: string) =>
    setFilters((p) => ({ ...p, [key]: value }));
  const active =
    evaluation?.opportunityId === selected?.id ? evaluation : undefined;
  function download() {
    if (!active) return;
    const blob = new Blob(
        [
          JSON.stringify(
            {
              evaluation: active,
              receiptHash,
              hashAlgorithm: "SHA-256/canonical-json-v1",
            },
            null,
            2,
          ),
        ],
        {
          type: "application/json",
        },
      ),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "signalforge-real-underwriting.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <article className="container real-market">
      <header>
        <p className="eyebrow">SIGNALFORGE / {t("OBSERVED MARKET")}</p>
        <h1>{t("Price the work. Know the gaps.")}</h1>
        <p>
          {t(
            "Source-reported funding. Independent underwriting. Execution disabled.",
          )}
        </p>
      </header>
      <div className="real-filters">
        <label>
          {t("Search")}
          <input
            maxLength={120}
            value={filters.query}
            onChange={(e) => change("query", e.target.value)}
          />
        </label>
        <label>
          {t("Capability")}
          <select
            value={filters.capability}
            onChange={(e) => change("capability", e.target.value)}
          >
            <option value="">{t("All")}</option>
            {[...new Set(tasks.flatMap((x) => x.requiredCapabilities))].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <label>
          {t("Minimum reward")}
          <select
            value={filters.reward}
            onChange={(e) => change("reward", e.target.value)}
          >
            <option value="">{t("All")}</option>
            <option value="1000000">1 USDC</option>
            <option value="10000000">10 USDC</option>
          </select>
        </label>
        <label>
          {t("Payment state")}
          <select
            value={filters.payment}
            onChange={(e) => change("payment", e.target.value)}
          >
            <option value="">{t("All")}</option>
            <option value="escrowed">{t("Source reports escrow")}</option>
          </select>
        </label>
        <label>
          {t("Deadline")}
          <select
            value={filters.deadline}
            onChange={(e) => change("deadline", e.target.value)}
          >
            <option value="">{t("All")}</option>
            <option value="current">{t("Current deadline")}</option>
          </select>
        </label>
        <label>
          {t("Decision")}
          <select
            value={filters.decision}
            onChange={(e) => change("decision", e.target.value)}
          >
            <option value="">{t("All")}</option>
            <option value="insufficient_data">{t("INSUFFICIENT DATA")}</option>
            <option value="unroutable">{t("UNROUTABLE")}</option>
          </select>
        </label>
        <label>
          {t("Source")}
          <select
            value={filters.source}
            onChange={(e) => change("source", e.target.value)}
          >
            <option value="">{t("All")}</option>
            <option value="agentbounties">Agent Bounties</option>
          </select>
        </label>
      </div>
      <p className="mono">
        {visible.length} {t("observed opportunities")} ·{" "}
        {t("Bounded source sample")}{" "}
        {truncated
          ? `· ${t("More records exist; this view is limited to 20.")}`
          : ""}
      </p>
      {message && <p role="status">{t(message)}</p>}
      {!visible.length ? (
        <section className="real-empty">
          <h2>{t("No qualifying work in this snapshot.")}</h2>
          <p>
            {t(
              "Unknown inventory stays unknown. No demonstration tasks are substituted.",
            )}
          </p>
          <Link href="/network">{t("Inspect the network")} →</Link>
        </section>
      ) : (
        <div className="real-table-wrap">
          <table>
            <caption>{t("Observed opportunity radar")}</caption>
            <thead>
              <tr>
                {[
                  "Opportunity",
                  "Source",
                  "Reward",
                  "Known cost",
                  "Est. route cost",
                  "Expected value",
                  "Confidence",
                  "Decision",
                ].map((c) => (
                  <th key={c}>{t(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((task) => (
                <tr key={task.id} aria-selected={selected?.id === task.id}>
                  <td>
                    <button onClick={() => setSelected(task)}>
                      {task.title}
                    </button>
                  </td>
                  <td>
                    {task.sourceName}
                    <small>{task.freshness}</small>
                  </td>
                  <td>{atomicUsdc(task.demandState?.reward?.amount)}</td>
                  <td>
                    {atomicUsdc(
                      task.demandState?.requiredExternalSpend?.amount,
                    )}
                  </td>
                  <td>{t("Unknown")}</td>
                  <td>—</td>
                  <td>{t("Source-reported")}</td>
                  <td>
                    {t(
                      task.demandState?.eligibility === "not_eligible"
                        ? "UNROUTABLE"
                        : "INSUFFICIENT DATA",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <section
          className="real-inspector"
          aria-label={t("Opportunity inspector")}
        >
          <p className="eyebrow">
            {t("OBSERVED")} / {t("PRE-EXECUTION ESTIMATE")}
          </p>
          <h2>{selected.title}</h2>
          <p>{selected.description}</p>
          <a href={selected.sourceUrl} rel="noreferrer" target="_blank">
            {t("Original source")} ↗
          </a>
          <p className="mono">
            {selected.observedAt} · {selected.freshness}
          </p>
          <div className="real-columns">
            <section>
              <h3>{t("Economic envelope")}</h3>
              <dl>
                <dt>{t("Reward")}</dt>
                <dd>{atomicUsdc(selected.demandState?.reward?.amount)}</dd>
                <dt>{t("Known required spend")}</dt>
                <dd>
                  {atomicUsdc(
                    selected.demandState?.requiredExternalSpend?.amount,
                  )}
                </dd>
                <dt>{t("Refundable bond at risk")}</dt>
                <dd>
                  {atomicUsdc(selected.demandState?.refundableBond?.amount)}
                </dd>
                <dt>{t("Expected value")}</dt>
                <dd>{t("Unknown")}</dd>
                <dt>{t("Success probability")}</dt>
                <dd>{t("Unknown")}</dd>
                <dt>{t("Actual outcome observations")}</dt>
                <dd>0</dd>
              </dl>
              <p>
                {t(
                  "USDC amounts are exact source units. No USD conversion, fee completeness or winning probability is assumed.",
                )}
              </p>
            </section>
            <section>
              <h3>{t("Eligibility and constraints")}</h3>
              <p>
                {selected.demandState?.workState} /{" "}
                {selected.demandState?.paymentState}
              </p>
              <p>
                {t("Deadline")}: {selected.deadline ?? t("Unknown")}
              </p>
              <p>
                {t("Verifier")}: {selected.demandState?.verifier}
              </p>
              <p>
                {t("Capability coverage")}:{" "}
                {selected.requiredCapabilities.join(" → ") || t("Unknown")}
              </p>
              <label>
                {t("Minimum margin")} (bps)
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  value={minimumMargin}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 0 && n <= 10000)
                      setMargin(n);
                  }}
                />
              </label>
              <p>
                {t(
                  "Policy is evaluated server-side against the full bounded snapshot.",
                )}
              </p>
            </section>
          </div>
          {active ? (
            <>
              <h3>{t(active.decision.toUpperCase().replaceAll("_", " "))}</h3>
              <ul>
                {active.reasons.map((r) => (
                  <li key={r}>
                    <code>{r}</code>
                  </li>
                ))}
              </ul>
              <button className="primary-link" onClick={download}>
                {t("Download underwriting JSON")} ↗
              </button>
              <details>
                <summary>{t("Machine contract")}</summary>
                <pre>{JSON.stringify(active, null, 2)}</pre>
              </details>
            </>
          ) : (
            <p role="status">{t("Checking economic inputs…")}</p>
          )}
          <details>
            <summary>{t("Source evidence requirements")}</summary>
            <pre>{selected.demandState?.evidenceRequirements}</pre>
            <p>{selected.demandState?.evidenceBoundary}</p>
          </details>
          <p>
            {t("No claim, submission, payment or execution is authorized.")}
          </p>
        </section>
      )}
    </article>
  );
}
