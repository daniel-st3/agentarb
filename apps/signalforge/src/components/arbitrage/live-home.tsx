import { getCopy } from "@/i18n/server";
import Link from "@/i18n/navigation";
import { SignalField } from "@/components/editorial/atmosphere";
import { cachedNetworkView } from "@/server/intelligence/cached-view";
export async function LiveHome() {
  const t = await getCopy(),
    network = await cachedNetworkView(),
    tasks =
      network?.records.filter((x) => x.listingType === "task_opportunity") ??
      [],
    ready = tasks.find((x) => x.demandState?.eligibility === "source_ready");
  const reward = ready?.demandState?.reward;
  const spend = ready?.demandState?.requiredExternalSpend;
  const formatAmount = (amount: string) => {
    const n = BigInt(amount);
    return `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, "0").replace(/0+$/, "") || "00"} USDC`;
  };
  const value = reward
    ? `${BigInt(reward.amount) / 1000000n}.${(BigInt(reward.amount) % 1000000n).toString().padStart(6, "0").replace(/0+$/, "") || "00"} USDC`
    : null;
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
        <aside className="live-market-note">
          <p className="eyebrow">{t("CURRENT MARKET SNAPSHOT")}</p>
          {ready ? (
            <>
              <h2>{ready.title}</h2>
              <dl>
                <dt>{t("Source")}</dt>
                <dd>Agent Bounties</dd>
                <dt>{t("Observed reward")}</dt>
                <dd>{value}</dd>
                <dt>{t("Known required spend")}</dt>
                <dd>{spend ? formatAmount(spend.amount) : t("Unknown")}</dd>
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
            </>
          ) : (
            <>
              <h2>{t("No qualifying work in this snapshot.")}</h2>
              <p>
                {t(
                  "Unknown inventory stays unknown. No demonstration tasks are substituted.",
                )}
              </p>
            </>
          )}
          <Link href="/opportunities">
            {tasks.length} {t("observed opportunities")} →
          </Link>
        </aside>
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
