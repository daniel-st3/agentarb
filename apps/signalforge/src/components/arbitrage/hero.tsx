"use client";
import Link from "@/i18n/navigation";
import { useCopy } from "@/i18n/copy";
import { useLocale } from "next-intl";
import { m, useReducedMotion } from "motion/react";
import { SignalField } from "@/components/editorial/atmosphere";
import { useNetworkState } from "@/components/network-state";
import { evaluateArbitrage } from "@/domain/arbitrage";
import { arbitrageLab } from "@/domain/arbitrage-lab";
const sample = arbitrageLab[0];
const evaluation = evaluateArbitrage(
  sample.opportunity,
  { opportunityId: sample.opportunity.id, responseVersion: "2.0" },
  { lab: sample.specification },
);
export function ArbitrageHero() {
  const t = useCopy(),
    locale = useLocale(),
    reduce = useReducedMotion(),
    { status, loading } = useNetworkState();
  const money = (c: number | null) =>
    c === null
      ? "—"
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "USD",
        }).format(c / 100);
  return (
    <section className="arb-hero container" aria-labelledby="arb-title">
      <SignalField variant="hero" />
      <div className="arb-hero-copy">
        <p className="eyebrow">
          {t("SIGNALFORGE / AGENT ECONOMY UNDERWRITER")}
        </p>
        <h1 id="arb-title">
          {t("Find profitable routes")}
          <br />
          <em>{t("across the agent economy.")}</em>
        </h1>
        <p className="arb-lede">
          {t(
            "Match paid work to AI services. Find out whether the spread survives cost, risk and verification.",
          )}
        </p>
        <div className="arb-hero-actions">
          <Link className="primary-link" href="/opportunities?mode=lab">
            {t("Open Arbitrage Lab")} <span>↗</span>
          </Link>
          <Link href="/opportunities?mode=observed">
            {t("Inspect observed demand")} →
          </Link>
        </div>
        <p className="arb-quiet">
          {t("Live supply metadata. Controlled task economics. No execution.")}
        </p>
      </div>
      <div
        className="arb-hero-route"
        aria-label={t("Simulated underwriting example")}
      >
        <p className="eyebrow">
          {t("SIMULATED / ARBITRAGE LAB")} <span>01</span>
        </p>
        <m.div className="arb-demand" initial={false} animate={{ opacity: 1 }}>
          <span>{t("PAID OPPORTUNITY")}</span>
          <h2>{t("Verified market comparison")}</h2>
          <strong>{money(evaluation.payout.amountCents)}</strong>
        </m.div>
        <div className="arb-trace" aria-hidden="true">
          <span />
          <i />
        </div>
        <div className="arb-supplier-list">
          {evaluation.candidates[0].route.route.map((step, i) => (
            <m.div
              key={step.step}
              initial={reduce ? false : { opacity: 0.45, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: reduce ? 0 : 0.28,
                delay: reduce ? 0 : i * 0.08,
              }}
            >
              <span className="mono">0{i + 1}</span>
              <span>
                {t(step.capability.replaceAll("_", " "))}
                <small>{step.selectedProvider.name}</small>
              </span>
              <b>
                {money(
                  Math.round(step.selectedProvider.estimatedCostUsd * 100),
                )}
              </b>
            </m.div>
          ))}
        </div>
        <div className="arb-hero-total">
          <span>{t("Expected total cost")}</span>
          <b>{money(evaluation.economics.expectedTotalCostCents)}</b>
        </div>
        <m.div
          className="arb-hero-spread"
          initial={false}
          animate={{ opacity: 1 }}
        >
          <span>
            {t("Expected profit")}
            <small>{t("Conditional, simulated spread")}</small>
          </span>
          <strong>+{money(evaluation.economics.expectedProfitCents)}</strong>
          <span>
            {evaluation.economics.expectedMarginBps! / 100}% {t("margin")}
          </span>
          <span className="arb-decision profitable">{t("PROFITABLE")}</span>
        </m.div>
      </div>
      <div className="arb-reality">
        <Link href="/network">
          <span>{t("SUPPLY DISCOVERY")}</span>
          <b>
            {status?.observedCount
              ? status.observedCount + " " + t("OBSERVED")
              : t(loading ? "LOADING" : "UNAVAILABLE")}
          </b>
        </Link>
        <span>
          <small>{t("ROUTE COMPILER / UNDERWRITER")}</small>
          <b>{t("DETERMINISTIC")}</b>
        </span>
        <Link href="/developers/try">
          <span>REST / MCP</span>
          <b>{t("INSPECTABLE")}</b>
        </Link>
        <span>
          <small>{t("EXECUTION / WRITES / PAYMENTS")}</small>
          <b>{t("DISABLED")}</b>
        </span>
      </div>
    </section>
  );
}
