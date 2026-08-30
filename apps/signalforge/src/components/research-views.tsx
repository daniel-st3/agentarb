"use client";
import Link from "next/link";
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
import { useRouter } from "next/navigation";
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
  return (
    <div className="budget-card">
      <div className="flex-between">
        <span>Modeled route cost</span>
        <b>
          {money(run.plan.estimatedTotalCostUsd)}{" "}
          <span>/ {money(run.request.budgetUsd)}</span>
        </b>
      </div>
      <div
        className="meter"
        role="meter"
        aria-label="Modeled budget usage"
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
        Hard cap enforced. Actual service spend: <strong>$0.00</strong>.
      </p>
    </div>
  );
}
export function PlanView({ id }: { id: string }) {
  const { runs, save } = useResearchSession();
  const run = runs.find((r) => r.request.id === id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  if (!run) return <EmptyRun />;
  if (run.brief)
    return (
      <div className="empty-state">
        <h1>This research is complete.</h1>
        <ActionLink href={`/forge/${id}`}>Read the brief</ActionLink>
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
        <Eyebrow>TRANSPARENT PRE-FLIGHT</Eyebrow>
        <h1>Research route</h1>
        <p>{run.request.question}</p>
        <div className="metadata-row">
          <Status>{policyLabels[run.request.optimizationPolicy]}</Status>
          <span>{money(run.request.budgetUsd)} modeled budget</span>
          <span>Fictional case · demo only</span>
        </div>
      </div>
      <div className="plan-layout">
        <aside className="plan-request">
          <Eyebrow>REQUEST / CONSTRAINTS</Eyebrow>
          <p>{run.request.question}</p>
          <dl>
            <div>
              <dt>Policy</dt>
              <dd>{policyLabels[run.request.optimizationPolicy]}</dd>
            </div>
            <div>
              <dt>Budget cap</dt>
              <dd>{money(run.request.budgetUsd)}</dd>
            </div>
            <div>
              <dt>Modeled quality</dt>
              <dd>{Math.round(run.plan.expectedQualityScore * 100)} / 100</dd>
            </div>
            <div>
              <dt>Modeled duration</dt>
              <dd>{run.plan.expectedLatencySeconds}s</dd>
            </div>
          </dl>
          <p className="field-help">
            Fixture inputs, not measured service performance. No external calls.
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
                      <h2>{offer.name}</h2>
                      <span className="capability">
                        {step.capabilityNeeded.replaceAll("_", " ")}
                      </span>
                    </div>
                    <Status>Mock</Status>
                  </div>
                  <p>{step.reasonSelected}</p>
                  <div className="provider-stats">
                    <span>
                      Modeled cost<b>{money(step.estimatedCostUsd)}</b>
                    </span>
                    <span>
                      Modeled latency<b>{offer.estimatedLatencySeconds}s</b>
                    </span>
                    <span>
                      Fixture quality
                      <b>{Math.round(offer.qualityScore * 100)} / 100</b>
                    </span>
                    <span>
                      Fixture reliability
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
                {error}
              </p>
            )}
            <button
              className="button full-width"
              disabled={busy}
              onClick={execute}
            >
              {busy ? "Compiling demo evidence…" : "Run research"}
              <ArrowRight size={18} />
            </button>
            <p className="privacy-note" aria-live="polite">
              {busy
                ? "Running local fixture adapters, checking independent support, and compiling the brief."
                : "Run starts the selected demo route only. No external services are called."}
            </p>
            <Link className="text-link" href="/forge">
              <ArrowLeft size={14} />
              Change the request
            </Link>
          </div>
        </div>
        <aside className="plan-sidebar" data-reveal>
          <Eyebrow>WHY THIS ROUTE</Eyebrow>
          <h3>
            The useful work.
            <br />
            Within your limit.
          </h3>
          <p>{run.plan.planningExplanation}</p>
          <Budget run={run} />
          <p className="field-help">
            Expected latency is a modeled comparison, not a promised runtime.
            Quality and reliability are fixture inputs, not measured vendor
            ratings.
          </p>
          {run.request.targetUrl && (
            <p className="field-help">
              Your target URL is recorded as context only. This run will not
              fetch it.
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
export function BriefView({ id }: { id: string }) {
  const { runs } = useResearchSession();
  const run = runs.find((r) => r.request.id === id);
  if (!run) return <EmptyRun />;
  if (!run.brief || !run.receipt)
    return (
      <div className="empty-state">
        <h1>Your route is ready to inspect.</h1>
        <ActionLink href={`/forge/${id}/plan`}>View the plan</ActionLink>
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
              SIGNALFORGE / RESEARCH BRIEF /{" "}
              {run.example
                ? run.request.id.replace("example-", "00")
                : "SESSION"}
            </span>
            <span className="report-stamp" aria-hidden="true">
              SF / DEMO EDITION <i>＋</i>
            </span>
          </div>
          <Eyebrow>
            SIGNALFORGE / {run.example ? "EXAMPLE BRIEF" : "SESSION BRIEF"} /{" "}
            {policyLabels[run.request.optimizationPolicy]} / DEMO MODE
          </Eyebrow>
          <h1>{brief.title}</h1>
          <p className="brief-question">{run.request.question}</p>
          <div className="brief-meta">
            <span>
              <Clock size={14} />
              {run.example
                ? "Seeded example"
                : `${receipt.elapsedSeconds < 0.01 ? "<0.01" : receipt.elapsedSeconds.toFixed(2)}s local processing`}
            </span>
            <span>
              {receipt.sourceCount} fixture documents ·{" "}
              {receipt.evidenceItemCount} excerpts
            </span>
            <span>
              {receipt.verifiedClaimCount} claims corroborated in simulation
            </span>
            <span>$0.00 actual spend</span>
          </div>
          <div className="provenance-banner">
            <ShieldCheck size={18} />
            <span>
              <strong>Simulated demo evidence.</strong> Fictional companies and
              authored documents. This is a predefined case brief, not bespoke
              research. No live research was performed.
            </span>
          </div>
        </div>
        <div className="brief-layout">
          <article className="report-body">
            <section className="executive-answer" id="answer" data-reveal>
              <Eyebrow>THE ANSWER</Eyebrow>
              <p>{brief.executiveSummary}</p>
            </section>
            <section className="findings" data-reveal>
              <div className="section-topline">
                <h2>Key findings</h2>
                <span>Evidence-led, not certainty-led.</span>
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
                      {claim.verificationStatus === "corroborated_in_simulation"
                        ? "Corroborated in simulation"
                        : claim.verificationStatus === "single_source"
                          ? "Single-source"
                          : "Unverified"}
                    </Status>
                    <h3>{claim.text}</h3>
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
                          {brief.sources.find((s) => s.id === eid)
                            ?.providerId === "demo-verification"
                            ? "Independent review"
                            : "Company fixture"}{" "}
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
                <Eyebrow>WHAT WE KNOW IN THIS CASE</Eyebrow>
                <h3>The evidence supports a direction.</h3>
                <p>
                  {receipt.verifiedClaimCount
                    ? `${receipt.verifiedClaimCount} important claims have support from two independently modeled source families and providers.`
                    : "The available material is single-source or insufficient. There is no independent corroboration."}
                </p>
                <p>
                  These are simulation results—not independently established
                  real-world facts.
                </p>
              </div>
              <div>
                <Eyebrow>WHAT REMAINS UNCERTAIN</Eyebrow>
                <ul>
                  {brief.risksAndUnknowns.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </div>
            </section>
            <details className="evidence-ledger" id="evidence-ledger">
              <summary>
                <span>Evidence ledger</span>
                <span>
                  {brief.sources.length} excerpts · inspect provenance
                </span>
              </summary>
              {brief.sources.length === 0 && (
                <p>
                  No matching fixture evidence. No source URLs have been
                  invented.
                </p>
              )}
              {brief.sources.map((e) => (
                <article id={e.id} key={e.id}>
                  <Status>Simulated demo evidence</Status>
                  <h3>{e.sourceTitle}</h3>
                  <blockquote>{e.excerpt}</blockquote>
                  <dl>
                    <div>
                      <dt>Provider</dt>
                      <dd>{e.providerId}</dd>
                    </div>
                    <div>
                      <dt>Source family</dt>
                      <dd>{e.independentSourceId}</dd>
                    </div>
                    <div>
                      <dt>Claim relevance</dt>
                      <dd>
                        {brief.claims.find((c) => c.id === e.claimId)?.text}
                      </dd>
                    </div>
                    <div>
                      <dt>Materialized at</dt>
                      <dd>{e.retrievedAt}</dd>
                    </div>
                    <div>
                      <dt>Fixture confidence (not measured)</dt>
                      <dd>{e.confidence.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Source URL</dt>
                      <dd>
                        None — authored fixture document, not a public source.
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
                Export Markdown
              </button>
              <button
                className="button secondary"
                onClick={() => download(run, "json")}
              >
                <Download size={16} />
                Download audit JSON
              </button>
              <Link className="text-link" href="/forge">
                Forge another <ArrowUpRight size={16} />
              </Link>
            </div>
            <p className="privacy-note">
              Exports include your request and optional target URL. Review them
              before sharing.
            </p>
          </article>
          <ResearchReceipt run={run} />
        </div>
      </Reveal>
    </div>
  );
}
export function HistoryView() {
  const { runs } = useResearchSession();
  const sorted = [...runs].sort((a, b) =>
    b.request.createdAt.localeCompare(a.request.createdAt),
  );
  return (
    <div className="history-page container">
      <Eyebrow>YOUR RESEARCH, IN CONTEXT</Eyebrow>
      <div className="history-heading">
        <div>
          <h1>Archive</h1>
          <p>
            Example briefs and this tab’s research. No account, no permanent
            archive.
          </p>
        </div>
        <ActionLink href="/forge">Forge a brief</ActionLink>
      </div>
      <div className="history-list">
        <div className="archive-labels" aria-hidden="true">
          <span>DATE</span>
          <span>REPORT / EVIDENCE</span>
          <span>POLICY</span>
          <span>COST</span>
          <span>STATE</span>
          <span>↗</span>
        </div>
        {sorted.map((run) => (
          <ArchiveRow run={run} key={run.request.id} />
        ))}{" "}
      </div>
      <DemoNotice />
      <p className="privacy-note">
        Seeded examples are fictional, not previous customer activity. New runs
        clear on reload.
      </p>
    </div>
  );
}
