"use client";
import { useCopy } from "@/i18n/copy";

import Link from "@/i18n/navigation";
import { FileText, Check, ArrowUpRight } from "lucide-react";
import type { Run } from "@/domain/schema";
import { policyLabels } from "@/domain/engine";
import { Eyebrow, Status, money } from "../ui";
export function Alternatives({ run }: { run: Run }) {
  const t = useCopy();

  return (
    <details className="alternatives">
      <summary>
        {t("Alternatives not selected")}{" "}
        <span>
          {t(run.plan.steps.flatMap((s) => s.alternativesConsidered).length)}
        </span>
      </summary>
      {run.plan.steps
        .flatMap((s) => s.alternativesConsidered)
        .map((a) => (
          <div className="alternative-row" key={a.providerId}>
            <strong>{t(a.name)}</strong>
            <p>{t(a.reason)}</p>
            <code>
              {a.code}
              {a.code === "catalog_only" ? " · x402_catalog_only" : ""}
            </code>
          </div>
        ))}
      <p className="field-help">
        {t(
          "Catalog concepts are illustrative local metadata—not discovered live offers.",
        )}
      </p>
    </details>
  );
}
export function ResearchReceipt({ run }: { run: Run }) {
  const t = useCopy();

  const { receipt, brief } = run;
  if (!receipt || !brief) return null;
  return (
    <aside className="receipt" data-reveal>
      <div className="receipt-header">
        <Eyebrow>{t("RESEARCH RECEIPT")}</Eyebrow>
        <FileText size={19} />
      </div>
      <div className="receipt-total">
        <span>{t("Actual service spend")}</span>
        <strong>$0.00</strong>
        <Status positive>{t("No external calls")}</Status>
      </div>
      <dl className="receipt-facts">
        <div>
          <dt>{t("Hard modeled budget")}</dt>
          <dd>{money(receipt.budgetUsd)}</dd>
        </div>
        <div>
          <dt>{t("Estimated route cost")}</dt>
          <dd>{money(receipt.estimatedSpendUsd)}</dd>
        </div>
        <div>
          <dt>{t("Simulated route cost")}</dt>
          <dd>{money(receipt.simulatedSpendUsd)}</dd>
        </div>
        <div>
          <dt>{t("Policy")}</dt>
          <dd>{t(policyLabels[run.request.optimizationPolicy])}</dd>
        </div>
      </dl>
      <Eyebrow>{t("PROVIDER MIX")}</Eyebrow>
      <div className="receipt-providers">
        {receipt.providerBreakdown.map((p) => (
          <div key={p.providerId}>
            <Check size={13} />
            <span>
              {t(p.name)}
              <small>
                {t("Mock · modeled")}
                {money(p.simulatedCostUsd)}
              </small>
            </span>
          </div>
        ))}
      </div>
      <dl className="receipt-facts">
        <div>
          <dt>{t("Fixture documents")}</dt>
          <dd>{t(receipt.sourceCount)}</dd>
        </div>
        <div>
          <dt>{t("Simulated corroborations")}</dt>
          <dd>{t(receipt.verifiedClaimCount)}</dd>
        </div>
      </dl>
      <Alternatives run={run} />
      <p className="receipt-disclaimer">{t(receipt.provenanceNotice)}</p>
      <div className="receipt-id">
        <span>{t("RUN ID / v1")}</span>
        <code>{run.request.id}</code>
        <span>{brief.createdAt}</span>
      </div>
    </aside>
  );
}
export function ArchiveRow({ run }: { run: Run }) {
  const t = useCopy();

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
          {t(run.example ? "SEEDED EXAMPLE" : "THIS SESSION")}
        </div>
        <h2>{run.brief?.title ?? run.request.question}</h2>
        <p>
          {run.receipt?.sourceCount ?? 0}{" "}
          {t("fixture documents · Mock providers")}
        </p>
      </div>
      <span className="archive-policy">
        {t(policyLabels[run.request.optimizationPolicy])}
      </span>
      <div className="history-cost">
        <strong>
          {money(run.request.budgetUsd)} {t("cap")}
        </strong>
        <span>
          {money(run.plan.estimatedTotalCostUsd)} {t("modeled")}
          <br />
          {t("$0.00 actual")}
        </span>
      </div>
      <span className="archive-state">
        {t(run.request.status === "complete" ? "Complete" : "Planned")}
      </span>
      <ArrowUpRight size={17} />
    </Link>
  );
}
