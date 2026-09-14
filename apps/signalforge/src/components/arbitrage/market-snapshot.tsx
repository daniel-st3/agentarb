"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import Link from "@/i18n/navigation";
import { useCopy } from "@/i18n/copy";
import {
  TaskOpportunitySchema,
  type TaskOpportunity,
} from "@/domain/intelligence";
import { refreshDemandEligibility } from "@/domain/real-economics";
import { useObservationClock } from "./use-observation-clock";
const snapshotSchema = z.object({
  records: z.array(TaskOpportunitySchema).max(20),
});
function amount(value: string) {
  const n = BigInt(value),
    fraction = (n % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${n / 1000000n}${fraction ? `.${fraction}` : ""} USDC`;
}
export function MarketSnapshot({
  initialTasks,
  initialTime,
}: {
  initialTasks: TaskOpportunity[];
  initialTime: number;
}) {
  const t = useCopy(),
    [tasks, setTasks] = useState(initialTasks),
    [unavailable, setUnavailable] = useState(false);
  const now = useObservationClock(initialTime, tasks);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/v1/opportunities?mode=observed&limit=20", {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return snapshotSchema.parse(await r.json());
      })
      .then((data) => {
        if (!abort.signal.aborted) {
          setTasks(data.records);
          setUnavailable(false);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setUnavailable(true);
      });
    return () => abort.abort();
  }, []);
  const ready = tasks.find(
    (task) =>
      task.demandState &&
      refreshDemandEligibility(task.demandState, task.deadline, now)
        .eligibility === "source_ready",
  );
  return (
    <aside
      className="live-market-note"
      aria-label={t("CURRENT MARKET SNAPSHOT")}
    >
      <p className="eyebrow">{t("CURRENT MARKET SNAPSHOT")}</p>
      <div className="snapshot-track" aria-hidden="true">
        <i />
        <span />
        <i />
        <span />
        <i />
      </div>
      {ready ? (
        <>
          <h2>{ready.title}</h2>
          <dl>
            <dt>{t("Source")}</dt>
            <dd>{ready.sourceName}</dd>
            <dt>{t("Observed reward")}</dt>
            <dd>
              {ready.demandState?.reward
                ? amount(ready.demandState.reward.amount)
                : t("Unknown")}
            </dd>
            <dt>{t("Known required spend")}</dt>
            <dd>
              {ready.demandState?.requiredExternalSpend
                ? amount(ready.demandState.requiredExternalSpend.amount)
                : t("Unknown")}
            </dd>
            <dt>{t("Est. route cost")}</dt>
            <dd>{t("Unknown")}</dd>
            <dt>{t("Decision")}</dt>
            <dd>{t("INSUFFICIENT DATA")}</dd>
          </dl>
          <p>
            {t(
              "Funding is source-reported. Costs and eligibility still require review.",
            )}
          </p>
          <p className="snapshot-provenance mono">
            {t("Observed at")}{" "}
            <time dateTime={ready.observedAt}>
              {ready.observedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC")}
            </time>{" "}
            · {ready.freshness}
          </p>
        </>
      ) : (
        <>
          <h2>
            {t(
              unavailable
                ? "Market observations are temporarily unavailable."
                : "No qualifying work in this snapshot.",
            )}
          </h2>
          <p>
            {t(
              "Unknown inventory stays unknown. No demonstration tasks are substituted.",
            )}
          </p>
        </>
      )}
      {unavailable && tasks.length > 0 && (
        <p role="status">
          {t("Market snapshot unavailable. Last known data is retained.")}
        </p>
      )}
      <Link
        href={
          ready
            ? `/opportunities?id=${encodeURIComponent(ready.id)}`
            : "/opportunities"
        }
      >
        {ready
          ? t("Inspect this opportunity")
          : `${tasks.length} ${t("observed opportunities")}`}{" "}
        →
      </Link>
    </aside>
  );
}
