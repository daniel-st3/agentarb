import { getCopy } from "@/i18n/server";
import Link from "@/i18n/navigation";
import { SignalField } from "@/components/editorial/atmosphere";
import {
  cachedNetworkView,
  snapshotEvaluationTime,
} from "@/server/intelligence/cached-view";
import { MarketSnapshot } from "./market-snapshot";
export async function LiveHome() {
  const t = await getCopy(),
    network = await cachedNetworkView();
  const tasks =
    network?.records
      .filter((r) => r.listingType === "task_opportunity")
      .slice(0, 20) ?? [];
  return (
    <>
      <section className="container live-hero">
        <SignalField variant="hero" />
        <div>
          <p className="eyebrow">SIGNALFORGE / {t("AGENT WORK UNDERWRITER")}</p>
          <h1>{t("Find profitable AI-agent work.")}</h1>
          <p className="live-lede">
            {t(
              "Discover paid work. Price a fulfillment route. See whether the economics hold.",
            )}
          </p>
          <div className="live-actions">
            <Link className="primary-link" href="/opportunities">
              {t("Inspect paid work")} ↗
            </Link>
            <Link href="/how-it-works">{t("How it works")} →</Link>
          </div>
        </div>
        <MarketSnapshot
          initialTasks={tasks}
          initialTime={snapshotEvaluationTime()}
        />
      </section>
      <div className="container live-reality mono">
        <span>{t("OBSERVED INPUTS")}</span>
        <span>{t("DETERMINISTIC POLICY")}</span>
        <span>{t("UNKNOWN STAYS UNKNOWN")}</span>
        <span>{t("EXECUTION DISABLED")}</span>
      </div>
      <section className="container live-steps">
        {[
          ["01", "FIND", "Observe paid work and its funding constraints."],
          [
            "02",
            "PRICE",
            "Separate published prices, bounded estimates and missing costs.",
          ],
          [
            "03",
            "DECIDE",
            "Inspect the policy decision and auditable contract.",
          ],
        ].map(([n, h, p]) => (
          <section key={n}>
            <span className="mono">{n}</span>
            <h2>{t(h)}</h2>
            <p>{t(p)}</p>
          </section>
        ))}
      </section>
      <section className="container live-proof">
        <h2>{t("Built for operators. Readable by agents.")}</h2>
        <Link href="/developers/try">
          REST / MCP / {t("Inspect the contract")} ↗
        </Link>
        <Link className="primary-link" href="/opportunities">
          {t("Inspect paid work")} ↗
        </Link>
      </section>
    </>
  );
}
