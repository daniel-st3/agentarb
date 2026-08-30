"use client";
import Link from "next/link";
import { FileText, Check, ArrowUpRight } from "lucide-react";
import type { Run } from "@/domain/schema";
import { policyLabels } from "@/domain/engine";
import { Eyebrow, Status, money } from "../ui";
export function Alternatives({ run }: { run: Run }) {
  return (
    <details className="alternatives">
      <summary>
        Alternatives not selected{" "}
        <span>
          {run.plan.steps.flatMap((s) => s.alternativesConsidered).length}
        </span>
      </summary>
      {run.plan.steps
        .flatMap((s) => s.alternativesConsidered)
        .map((a) => (
          <div className="alternative-row" key={a.providerId}>
            <strong>{a.name}</strong>
            <p>{a.reason}</p>
            <code>
              {a.code}
              {a.code === "catalog_only" ? " · x402_catalog_only" : ""}
            </code>
          </div>
        ))}
      <p className="field-help">
        Catalog concepts are illustrative local metadata—not discovered live
        offers.
      </p>
    </details>
  );
}
export function ResearchReceipt({ run }: { run: Run }) {
  const { receipt, brief } = run;
  if (!receipt || !brief) return null;
  return (
    <aside className="receipt" data-reveal>
      <div className="receipt-header">
        <Eyebrow>RESEARCH RECEIPT</Eyebrow>
        <FileText size={19} />
      </div>
      <div className="receipt-total">
        <span>Actual service spend</span>
        <strong>$0.00</strong>
        <Status positive>No external calls</Status>
      </div>
      <dl className="receipt-facts">
        <div>
          <dt>Hard modeled budget</dt>
          <dd>{money(receipt.budgetUsd)}</dd>
        </div>
        <div>
          <dt>Estimated route cost</dt>
          <dd>{money(receipt.estimatedSpendUsd)}</dd>
        </div>
        <div>
          <dt>Simulated route cost</dt>
          <dd>{money(receipt.simulatedSpendUsd)}</dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd>{policyLabels[run.request.optimizationPolicy]}</dd>
        </div>
      </dl>
      <Eyebrow>PROVIDER MIX</Eyebrow>
      <div className="receipt-providers">
        {receipt.providerBreakdown.map((p) => (
          <div key={p.providerId}>
            <Check size={13} />
            <span>
              {p.name}
              <small>Mock · modeled {money(p.simulatedCostUsd)}</small>
            </span>
          </div>
        ))}
      </div>
      <dl className="receipt-facts">
        <div>
          <dt>Fixture documents</dt>
          <dd>{receipt.sourceCount}</dd>
        </div>
        <div>
          <dt>Simulated corroborations</dt>
          <dd>{receipt.verifiedClaimCount}</dd>
        </div>
      </dl>
      <Alternatives run={run} />
      <p className="receipt-disclaimer">{receipt.provenanceNotice}</p>
      <div className="receipt-id">
        <span>RUN ID / v1</span>
        <code>{run.request.id}</code>
        <span>{brief.createdAt}</span>
      </div>
    </aside>
  );
}
export function ArchiveRow({ run }: { run: Run }) {
  return (
    <Link
      href={`/forge/${run.request.id}${run.brief ? "" : "/plan"}`}
      className="history-row"
    >
      <time dateTime={run.request.createdAt}>
        {run.request.createdAt.slice(0, 10)}
      </time>
      <div>
        <div className="history-kicker">
          {run.example ? "SEEDED EXAMPLE" : "THIS SESSION"}
        </div>
        <h2>{run.brief?.title ?? run.request.question}</h2>
        <p>
          {run.receipt?.sourceCount ?? 0} fixture documents · Mock providers
        </p>
      </div>
      <span className="archive-policy">
        {policyLabels[run.request.optimizationPolicy]}
      </span>
      <div className="history-cost">
        <strong>{money(run.request.budgetUsd)} cap</strong>
        <span>
          {money(run.plan.estimatedTotalCostUsd)} modeled
          <br />
          $0.00 actual
        </span>
      </div>
      <span className="archive-state">
        {run.request.status === "complete" ? "Complete" : "Planned"}
      </span>
      <ArrowUpRight size={17} />
    </Link>
  );
}
