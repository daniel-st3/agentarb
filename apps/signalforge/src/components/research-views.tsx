"use client";
import { useCopy } from "@/i18n/copy";

import Link from "@/i18n/navigation";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  ShieldCheck,
  Layers,
  Download,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useResearchSession } from "./session";
import {
  DemoNotice,
  EmptyRun,
  Eyebrow,
  money,
  Status,
  StepHeader,
  ActionLink,
} from "./ui";
import { Reveal } from "./motion";
import {
  ResearchReceipt,
  ArchiveRow,
  Alternatives,
} from "./editorial/artifacts";
import { RunSchema, type Run } from "@/domain/schema";
import { policyLabels } from "@/domain/engine";

function Budget({ run }: { run: Run }) {
  const t = useCopy();

  return (
    <div className="budget-card">
      <div className="flex-between">
        <span>{t("Modeled route cost")}</span>
        <b>
          {money(run.plan.estimatedTotalCostUsd)}{" "}
          <span>/ {money(run.request.budgetUsd)}</span>
        </b>
      </div>
      <div
        className="meter"
        role="meter"
        aria-label={t("Modeled budget usage")}
        aria-valuemin={0}
        aria-valuemax={run.request.budgetUsd || 1}
        aria-valuenow={run.plan.estimatedTotalCostUsd}
      >
        <div
          className="budget-fill"
          style={{
            width: `${run.request.budgetUsd ? (run.plan.estimatedTotalCostUsd / run.request.budgetUsd) * 100 : 0}%`,
          }}
        />
      </div>
      <p>
        {t("Hard cap enforced. Actual service spend:")}
        <strong>$0.00</strong>.
      </p>
    </div>
  );
}
export function PlanView({ id }: { id: string }) {
  const t = useCopy();

  const { runs, save } = useResearchSession();
  const run = runs.find((r) => r.request.id === id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  if (!run) return <EmptyRun />;
  if (run.brief)
    return (
      <div className="empty-state">
        <h1>{t("This research is complete.")}</h1>
        <ActionLink href={`/forge/${id}`}>{t("Read the brief")}</ActionLink>
      </div>
    );
  async function execute() {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: run.request, consent: true }),
      });
      if (!response.ok)
        throw new Error(
          "The demo couldn't complete. Please try again or create a new route.",
        );
      const completed = RunSchema.parse(await response.json());
      await save(completed);
      router.push(`/forge/${id}`);
    } catch {
      setError(
        "This demo route couldn't finish. Check your connection, then try again or create a new route.",
      );
      setBusy(false);
    }
  }
  return (
    <Reveal className="workspace container">
      <StepHeader step="Plan" />
      <div className="workspace-title" data-reveal>
        <Eyebrow>{t("TRANSPARENT PRE-FLIGHT")}</Eyebrow>
        <h1>{t("Research route")}</h1>
        <p>{run.request.question}</p>
        <div className="metadata-row">
          <Status>{t(policyLabels[run.request.optimizationPolicy])}</Status>
          <span>
            {money(run.request.budgetUsd)} {t("modeled budget")}
          </span>
          <span>{t("Fictional case · demo only")}</span>
        </div>
      </div>
      <div className="plan-layout">
        <aside className="plan-request">
          <Eyebrow>{t("REQUEST / CONSTRAINTS")}</Eyebrow>
          <p>{run.request.question}</p>
          <dl>
            <div>
              <dt>{t("Policy")}</dt>
              <dd>{t(policyLabels[run.request.optimizationPolicy])}</dd>
            </div>
            <div>
              <dt>{t("Budget cap")}</dt>
              <dd>{money(run.request.budgetUsd)}</dd>
            </div>
            <div>
              <dt>{t("Modeled quality")}</dt>
              <dd>{Math.round(run.plan.expectedQualityScore * 100)} / 100</dd>
            </div>
            <div>
              <dt>{t("Modeled duration")}</dt>
              <dd>
                {t(run.plan.expectedLatencySeconds)}
                {t("s")}
              </dd>
            </div>
          </dl>
          <p className="field-help">
            {t(
              "Fixture inputs, not measured service performance. No external calls.",
            )}
          </p>
        </aside>
        <div>
          <div className="plan-timeline">
            {run.plan.steps.map((step, i) => {
              const offer = run.offers.find(
                (o) => o.providerId === step.selectedProviderId,
              )!;
              const Icon =
                step.capabilityNeeded === "claim_verification"
                  ? ShieldCheck
                  : step.capabilityNeeded === "synthesis"
                    ? FileText
                    : Layers;
              return (
                <article className="plan-step" data-reveal key={step.stepId}>
                  <span className="plan-number">0{i + 1}</span>
                  <div className="provider-heading">
                    <div className="provider-icon">
                      <Icon size={21} />
                    </div>
                    <div>
                      <h2>{t(offer.name)}</h2>
                      <span className="capability">
                        {step.capabilityNeeded.replaceAll("_", " ")}
                      </span>
                    </div>
                    <Status>{t("Mock")}</Status>
                  </div>
                  <p>{t(step.reasonSelected)}</p>
                  <div className="provider-stats">
                    <span>
                      {t("Modeled cost")}
                      <b>{money(step.estimatedCostUsd)}</b>
                    </span>
                    <span>
                      {t("Modeled latency")}
                      <b>
                        {t(offer.estimatedLatencySeconds)}
                        {t("s")}
                      </b>
                    </span>
                    <span>
                      {t("Fixture quality")}
                      <b>{Math.round(offer.qualityScore * 100)} / 100</b>
                    </span>
                    <span>
                      {t("Fixture reliability")}
                      <b>{Math.round(offer.reliabilityScore * 100)}%</b>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
          <Alternatives run={run} />
          <div className="run-action">
            {error && (
              <p className="error-message" role="alert">
                {t(error)}
              </p>
            )}
            <button
              className="button full-width"
              disabled={busy}
              onClick={execute}
            >
              {t(busy ? "Compiling demo evidence…" : "Run research")}
              <ArrowRight size={18} />
            </button>
            <p className="privacy-note" aria-live="polite">
              {t(
                busy
                  ? "Running local fixture adapters, checking independent support, and compiling the brief."
                  : "Run starts the selected demo route only. No external services are called.",
              )}
            </p>
            <Link className="text-link" href="/forge">
              <ArrowLeft size={14} />
              {t("Change the request")}
            </Link>
          </div>
        </div>
        <aside className="plan-sidebar" data-reveal>
          <Eyebrow>{t("WHY THIS ROUTE")}</Eyebrow>
          <h3>
            {t("The useful work.")}
            <br />
            {t("Within your limit.")}
          </h3>
          <p>{t(run.plan.planningExplanation)}</p>
          <Budget run={run} />
          <p className="field-help">
            {t(
              "Expected latency is a modeled comparison, not a promised runtime. Quality and reliability are fixture inputs, not measured vendor ratings.",
            )}
          </p>
          {run.request.targetUrl && (
            <p className="field-help">
              {t(
                "Your target URL is recorded as context only. This run will not fetch it.",
              )}
            </p>
          )}
        </aside>
      </div>
      <DemoNotice />
    </Reveal>
  );
}
function download(run: Run, format: "md" | "json") {
  const content =
    format === "md"
      ? (run.brief?.markdownContent ?? "")
      : JSON.stringify(run, null, 2);
  const url = URL.createObjectURL(
    new Blob([content], {
      type:
        format === "md" ? "text/markdown;charset=utf-8" : "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `signalforge-${run.request.id}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
export function BriefView({ id, example }: { id: string; example?: Run }) {
  const t = useCopy();

  const { runs } = useResearchSession();
  const run = runs.find((r) => r.request.id === id) ?? example;
  if (!run) return <EmptyRun />;
  if (!run.brief || !run.receipt)
    return (
      <div className="empty-state">
        <h1>{t("Your route is ready to inspect.")}</h1>
        <ActionLink href={`/forge/${id}/plan`}>{t("View the plan")}</ActionLink>
      </div>
    );
  const { brief, receipt } = run;
  return (
    <div className="brief-paper">
      <Reveal className="brief-page container">
        <StepHeader step="Brief" />
        <div className="brief-title" data-reveal>
          <div className="report-masthead">
            <span>
              {t("SIGNALFORGE / RESEARCH BRIEF /")}{" "}
              {t(
                run.example
                  ? run.request.id.replace("example-", "00")
                  : "SESSION",
              )}
            </span>
            <span className="report-stamp" aria-hidden="true">
              {t("SF / DEMO EDITION")}
              <i>＋</i>
            </span>
          </div>
          <Eyebrow>
            {t("SIGNALFORGE /")}
            {t(run.example ? "EXAMPLE BRIEF" : "SESSION BRIEF")} /{" "}
            {t(policyLabels[run.request.optimizationPolicy])} {t("/ DEMO MODE")}
          </Eyebrow>
          <h1>{t(brief.title)}</h1>
          <p className="brief-question">{run.request.question}</p>
          <div className="brief-meta">
            <span>
              <Clock size={14} />
              {t(
                run.example
                  ? "Seeded example"
                  : `${receipt.elapsedSeconds < 0.01 ? "<0.01" : receipt.elapsedSeconds.toFixed(2)}s local processing`,
              )}
            </span>
            <span>
              {t(receipt.sourceCount)} {t("fixture documents ·")}{" "}
              {t(receipt.evidenceItemCount)} {t("excerpts")}
            </span>
            <span>
              {t(receipt.verifiedClaimCount)}{" "}
              {t("claims corroborated in simulation")}
            </span>
            <span>{t("$0.00 actual spend")}</span>
          </div>
          <div className="provenance-banner">
            <ShieldCheck size={18} />
            <span>
              <strong>{t("Simulated demo evidence.")}</strong>{" "}
              {t(
                "Fictional companies and authored documents. This is a predefined case brief, not bespoke research. No live research was performed.",
              )}
            </span>
          </div>
        </div>
        <div className="brief-layout">
          <article className="report-body">
            <section className="executive-answer" id="answer" data-reveal>
              <Eyebrow>{t("THE ANSWER")}</Eyebrow>
              <p>{t(brief.executiveSummary)}</p>
            </section>
            <section className="findings" data-reveal>
              <div className="section-topline">
                <h2>{t("Key findings")}</h2>
                <span>{t("Evidence-led, not certainty-led.")}</span>
              </div>
              {brief.claims.map((claim, i) => (
                <div className="finding" key={claim.id}>
                  <span className="finding-number">0{i + 1}</span>
                  <div>
                    <Status
                      positive={
                        claim.verificationStatus ===
                        "corroborated_in_simulation"
                      }
                    >
                      {t(
                        claim.verificationStatus ===
                          "corroborated_in_simulation"
                          ? "Corroborated in simulation"
                          : claim.verificationStatus === "single_source"
                            ? "Single-source"
                            : "Unverified",
                      )}
                    </Status>
                    <h3>{t(claim.text)}</h3>
                    <div className="citation-row">
                      {claim.evidenceIds.map((eid, j) => (
                        <a
                          key={eid}
                          href={`#${eid}`}
                          onClick={() => {
                            const ledger =
                              document.getElementById("evidence-ledger");
                            if (ledger instanceof HTMLDetailsElement)
                              ledger.open = true;
                          }}
                        >
                          <FileText size={12} />
                          {t(
                            brief.sources.find((s) => s.id === eid)
                              ?.providerId === "demo-verification"
                              ? "Independent review"
                              : "Company fixture",
                          )}{" "}
                          {j + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </section>
            <section className="known-grid" data-reveal>
              <div>
                <Eyebrow>{t("WHAT WE KNOW IN THIS CASE")}</Eyebrow>
                <h3>{t("The evidence supports a direction.")}</h3>
                <p>
                  {t(
                    receipt.verifiedClaimCount
                      ? `${receipt.verifiedClaimCount} important claims have support from two independently modeled source families and providers.`
                      : "The available material is single-source or insufficient. There is no independent corroboration.",
                  )}
                </p>
                <p>
                  {t(
                    "These are simulation results—not independently established real-world facts.",
                  )}
                </p>
              </div>
              <div>
                <Eyebrow>{t("WHAT REMAINS UNCERTAIN")}</Eyebrow>
                <ul>
                  {brief.risksAndUnknowns.map((u) => (
                    <li key={u}>{t(u)}</li>
                  ))}
                </ul>
              </div>
            </section>
            <details className="evidence-ledger" id="evidence-ledger">
              <summary>
                <span>{t("Evidence ledger")}</span>
                <span>
                  {t(brief.sources.length)} {t("excerpts · inspect provenance")}
                </span>
              </summary>
              {brief.sources.length === 0 && (
                <p>
                  {t(
                    "No matching fixture evidence. No source URLs have been invented.",
                  )}
                </p>
              )}
              {brief.sources.map((e) => (
                <article id={e.id} key={e.id}>
                  <Status>{t("Simulated demo evidence")}</Status>
                  <h3>{t(e.sourceTitle)}</h3>
                  <blockquote>{t(e.excerpt)}</blockquote>
                  <dl>
                    <div>
                      <dt>{t("Provider")}</dt>
                      <dd>{t(e.providerId)}</dd>
                    </div>
                    <div>
                      <dt>{t("Source family")}</dt>
                      <dd>{t(e.independentSourceId)}</dd>
                    </div>
                    <div>
                      <dt>{t("Claim relevance")}</dt>
                      <dd>
                        {t(brief.claims.find((c) => c.id === e.claimId)?.text)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("Materialized at")}</dt>
                      <dd>{t(e.retrievedAt)}</dd>
                    </div>
                    <div>
                      <dt>{t("Fixture confidence (not measured)")}</dt>
                      <dd>{e.confidence.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>{t("Source URL")}</dt>
                      <dd>
                        {t(
                          "None — authored fixture document, not a public source.",
                        )}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </details>
            <div className="export-actions">
              <button
                className="button secondary"
                onClick={() => download(run, "md")}
              >
                <Download size={16} />
                {t("Export Markdown")}
              </button>
              <button
                className="button secondary"
                onClick={() => download(run, "json")}
              >
                <Download size={16} />
                {t("Download audit JSON")}
              </button>
              <Link className="text-link" href="/forge">
                {t("Forge another")}
                <ArrowUpRight size={16} />
              </Link>
            </div>
            <p className="privacy-note">
              {t(
                "Exports include your request and optional target URL. Review them before sharing.",
              )}
            </p>
          </article>
          <ResearchReceipt run={run} />
        </div>
      </Reveal>
    </div>
  );
}
export function HistoryView() {
  const t = useCopy();

  const { runs } = useResearchSession();
  const sorted = [...runs].sort((a, b) =>
    b.request.createdAt.localeCompare(a.request.createdAt),
  );
  return (
    <div className="history-page container">
      <Eyebrow>{t("YOUR RESEARCH, IN CONTEXT")}</Eyebrow>
      <div className="history-heading">
        <div>
          <h1>{t("Archive")}</h1>
          <p>
            {t(
              "Example briefs and this tab’s research. No account, no permanent archive.",
            )}
          </p>
        </div>
        <ActionLink href="/forge">{t("Forge a brief")}</ActionLink>
      </div>
      <div className="history-list">
        <div className="archive-labels" aria-hidden="true">
          <span>{t("DATE")}</span>
          <span>{t("REPORT / EVIDENCE")}</span>
          <span>{t("POLICY")}</span>
          <span>{t("COST")}</span>
          <span>{t("STATE")}</span>
          <span>↗</span>
        </div>
        {sorted.map((run) => (
          <ArchiveRow run={run} key={run.request.id} />
        ))}{" "}
      </div>
      <DemoNotice />
      <p className="privacy-note">
        {t(
          "Seeded examples are fictional, not previous customer activity. New runs clear on reload.",
        )}
      </p>
    </div>
  );
}
