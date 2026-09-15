"use client";
import {
  calculateEconomics,
  classifyEconomics,
  type ArbitrageEvaluation,
} from "@/domain/arbitrage";
import { findLab } from "@/domain/arbitrage-lab";
import { useCopy } from "@/i18n/copy";
import { useLocale } from "next-intl";
export function Sensitivity({
  evaluation: e,
}: {
  evaluation: ArbitrageEvaluation;
}) {
  const t = useCopy(),
    locale = useLocale(),
    spec = findLab(e.opportunityId)?.specification;
  if (
    !spec ||
    e.economics.expectedTotalCostCents === null ||
    e.decision === "unroutable"
  )
    return null;
  const total = e.economics.expectedTotalCostCents;
  const upper = Math.max(
    100,
    (e.payout.amountCents ?? total) * 2,
    total + e.policy.minimumExpectedProfitCents + 20,
  );
  const points = Array.from({ length: 31 }, (_, i) => {
    const payout = Math.floor((i * upper) / 30);
    const economics = calculateEconomics(
      {
        payoutCents: payout,
        executionCostCents: e.economics.executionCostCents,
        verificationCostCents: e.economics.verificationCostCents,
        platformCostCents: e.economics.platformCostCents,
        costOfFailureCents: spec.costOfFailureCents,
        successProbabilityBps: e.risk.successProbabilityBps,
      },
      e.policy,
    );
    return {
      payout,
      profit: economics.expectedProfitCents ?? 0,
      decision: classifyEconomics(
        economics,
        e.policy,
        e.risk.successProbabilityBps,
      ).decision,
    };
  });
  const money = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(n / 100);
  const x = (n: number) => 24 + (252 * n) / upper,
    y = (profit: number) => 100 - (74 * (profit + total)) / upper;
  const current = e.payout.amountCents;
  return (
    <figure className="arb-sensitivity arb-curve">
      <figcaption>
        {t("Payout sensitivity")} · {t("USER SCENARIO")}
      </figcaption>
      <svg
        viewBox="0 0 300 128"
        role="img"
        aria-label={t("Estimated profit by payout scenario")}
      >
        <line
          x1="24"
          x2="276"
          y1={y(0)}
          y2={y(0)}
          stroke="currentColor"
          opacity=".3"
        />
        <path
          d={points
            .map((p, i) => (i ? "L" : "M") + x(p.payout) + "," + y(p.profit))
            .join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        {points.map((p) => (
          <circle
            key={p.payout}
            cx={x(p.payout)}
            cy={y(p.profit)}
            r="2.5"
            fill={
              p.decision === "profitable"
                ? "#b4ccbd"
                : p.decision === "marginal"
                  ? "#d8bd93"
                  : "#c68d89"
            }
          >
            <title>
              {money(p.payout)} →{" "}
              {t(
                p.decision === "profitable"
                  ? "PROFITABLE"
                  : p.decision === "marginal"
                    ? "MARGINAL"
                    : "UNECONOMIC",
              )}
            </title>
          </circle>
        ))}
        {current !== null && current <= upper && (
          <circle
            cx={x(current)}
            cy={y(current - total)}
            r="6"
            fill="none"
            stroke="#f4efe6"
          />
        )}
        <text x="24" y="122" fill="currentColor" fontSize="9">
          {money(0)}
        </text>
        <text x="276" y="122" textAnchor="end" fill="currentColor" fontSize="9">
          {money(upper)}
        </text>
      </svg>
      <div>
        <span>{t("UNECONOMIC")}</span>
        <span>{t("MARGINAL")}</span>
        <span>{t("PROFITABLE")}</span>
      </div>
    </figure>
  );
}
