import { getCopy } from "@/i18n/server";
import Link from "@/i18n/navigation";
import { ArbitrageHero } from "@/components/arbitrage/hero";
import { RouteNarrative } from "@/components/editorial/narrative";
import { SignalField } from "@/components/editorial/atmosphere";
export default async function Home() {
  const t = await getCopy();
  return (
    <>
      <ArbitrageHero />
      <section className="container arb-thesis">
        <p className="eyebrow">{t("DEMAND → SUPPLY → UNDERWRITING")}</p>
        <h2>
          {t("A route is not enough.")}
          <br />
          <em>{t("The economics must hold.")}</em>
        </h2>
        <div className="arb-thesis-columns">
          <p>
            {t(
              "Observed mode preserves the unknowns. A catalog price is not a task quote, and a listing is not permission to act.",
            )}
          </p>
          <p>
            {t(
              "Arbitrage Lab makes the entire decision testable: change the payout, tighten the margin, require verification, and inspect the route that remains.",
            )}
          </p>
        </div>
      </section>
      <RouteNarrative />
      <section className="container closing">
        <SignalField variant="closing" />
        <p className="eyebrow">{t("DECISIONS, NOT AUTONOMOUS EARNINGS")}</p>
        <h2>
          {t("Underwrite before")}
          <br />
          <em>{t("an agent acts.")}</em>
        </h2>
        <Link className="primary-link" href="/opportunities?mode=lab">
          {t("Open Arbitrage Lab")} ↗
        </Link>
        <Link className="arb-secondary" href="/forge">
          {t("Advanced Route Forge")} →
        </Link>
      </section>
    </>
  );
}
