import { z } from "zod";
import {
  FreshnessSchema,
  TaskOpportunitySchema,
  type CatalogService,
} from "./intelligence";
import {
  ExecutionRouteContractSchema,
  buildExecutionRoute,
} from "./route-planner";
import {
  decomposeObjective,
  type ObjectiveInput,
  type CapabilityId,
} from "./objective";
import { serviceOffers } from "./service-registry";

export const Cents = z.number().int().min(0).max(1_000_000);
export const Bps = z.number().int().min(0).max(10_000);
export const ArbitragePolicySchema = z
  .object({
    minimumExpectedProfitCents: Cents.default(20),
    minimumMarginBps: Bps.default(2500),
    maximumCapitalAtRiskCents: Cents.default(100),
    maximumRouteCostCents: z.number().int().min(0).max(1000).default(100),
    minimumSuccessProbabilityBps: Bps.default(0),
    requireIndependentVerification: z.boolean().default(false),
    maximumLatencySeconds: z.number().int().min(1).max(3600).default(60),
    allowedFreshness: z
      .array(FreshnessSchema)
      .min(1)
      .max(6)
      .default(["live", "cached_live", "simulated_demo"]),
    allowedSourceModes: z
      .array(z.enum(["observed", "lab"]))
      .min(1)
      .max(2)
      .default(["observed", "lab"]),
    allowedConfidence: z
      .array(z.enum(["high", "medium", "low", "unknown"]))
      .min(1)
      .max(4)
      .default(["high", "medium", "low", "unknown"]),
    optimization: z
      .enum([
        "max_profit",
        "risk_adjusted",
        "lowest_cost",
        "highest_reliability",
        "fastest",
      ])
      .default("max_profit"),
  })
  .strict();
export type ArbitragePolicy = z.infer<typeof ArbitragePolicySchema>;
export const ScenarioSchema = z
  .object({
    payoutCents: Cents.optional(),
    successProbabilityBps: Bps.optional(),
  })
  .strict();
export const ArbitrageInputSchema = z
  .object({
    opportunityId: z
      .string()
      .min(3)
      .max(240)
      .regex(/^[a-z0-9-]+:[a-zA-Z0-9_.:%/-]+$/),
    agentProfile: z
      .literal("default_demo_profile")
      .default("default_demo_profile"),
    responseVersion: z.literal("2.0"),
    policy: ArbitragePolicySchema.default(() =>
      ArbitragePolicySchema.parse({}),
    ),
    scenario: ScenarioSchema.optional(),
  })
  .strict();
export const DecisionSchema = z.enum([
  "profitable",
  "marginal",
  "uneconomic",
  "unroutable",
  "insufficient_data",
]);
export type Decision = z.infer<typeof DecisionSchema>;
const nullableMoney = z.number().int().nullable();
export const EconomicsSchema = z
  .object({
    executionCostCents: nullableMoney,
    verificationCostCents: nullableMoney,
    platformCostCents: nullableMoney,
    expectedFailureCostCents: nullableMoney,
    expectedTotalCostCents: nullableMoney,
    expectedProfitCents: nullableMoney,
    expectedMarginBps: nullableMoney,
    capitalAtRiskCents: nullableMoney,
    breakEvenPayoutCents: nullableMoney,
    maximumFulfillmentCostCents: nullableMoney,
    requiredSuccessProbabilityBps: nullableMoney,
    riskAdjustedExpectedValueCents: nullableMoney,
  })
  .strict();
export type Economics = z.infer<typeof EconomicsSchema>;
const CostInput = z
  .object({
    payoutCents: Cents.nullable(),
    executionCostCents: Cents.nullable(),
    verificationCostCents: Cents.nullable(),
    platformCostCents: Cents.nullable(),
    costOfFailureCents: Cents.nullable(),
    successProbabilityBps: Bps.nullable(),
  })
  .strict();
/** Integer-only products; costs round up, receipts/revenue round down. No binary-float money arithmetic. */
const floorRatio = (a: number, b: number, d: number) => {
  const n = BigInt(a) * BigInt(b),
    denominator = BigInt(d);
  return Number(n / denominator - (n < 0n && n % denominator !== 0n ? 1n : 0n));
};
/** Parse published USD decimals without treating IEEE floating-point residue as price precision. */
export function usdToCents(amount: number): number | null {
  const match = String(amount).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(
    BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0")),
  );
  return Cents.safeParse(cents).success ? cents : null;
}
const ceilRatio = (a: number, b: number, d: number) =>
  Number((BigInt(a) * BigInt(b) + BigInt(d) - 1n) / BigInt(d));
function minimumProbability(payout: number, base: number, failure: number) {
  if (payout < base) return ceilRatio(base + failure, 10000, payout + failure);
  let low = 0,
    high = 10000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (
      floorRatio(payout, mid, 10000) >=
      base + ceilRatio(failure, 10000 - mid, 10000)
    )
      high = mid;
    else low = mid + 1;
  }
  return low;
}
export function calculateEconomics(
  raw: z.infer<typeof CostInput>,
  policy: ArbitragePolicy,
): Economics {
  const x = CostInput.parse(raw),
    p = ArbitragePolicySchema.parse(policy);
  const failure =
    x.costOfFailureCents === 0
      ? 0
      : x.costOfFailureCents !== null && x.successProbabilityBps !== null
        ? ceilRatio(
            x.costOfFailureCents,
            10000 - x.successProbabilityBps,
            10000,
          )
        : null;
  const base =
    x.executionCostCents !== null &&
    x.verificationCostCents !== null &&
    x.platformCostCents !== null
      ? x.executionCostCents + x.verificationCostCents + x.platformCostCents
      : null;
  const total = base !== null && failure !== null ? base + failure : null;
  const payout = x.payoutCents,
    prob = x.successProbabilityBps;
  const profit = payout !== null && total !== null ? payout - total : null;
  const overhead =
    x.platformCostCents !== null && failure !== null
      ? x.platformCostCents + failure
      : null;
  const maximum =
    payout !== null && overhead !== null
      ? Math.max(
          0,
          Math.min(
            p.maximumRouteCostCents,
            payout - p.minimumExpectedProfitCents - overhead,
            floorRatio(payout, 10000 - p.minimumMarginBps, 10000) - overhead,
            p.maximumCapitalAtRiskCents -
              (x.platformCostCents ?? 0) -
              (x.costOfFailureCents ?? 0),
          ),
        )
      : null;
  return EconomicsSchema.parse({
    executionCostCents: x.executionCostCents,
    verificationCostCents: x.verificationCostCents,
    platformCostCents: x.platformCostCents,
    expectedFailureCostCents: failure,
    expectedTotalCostCents: total,
    expectedProfitCents: profit,
    expectedMarginBps:
      profit !== null && payout !== null && payout > 0
        ? floorRatio(profit, 10000, payout)
        : null,
    capitalAtRiskCents:
      base !== null && x.costOfFailureCents !== null
        ? base + x.costOfFailureCents
        : null,
    breakEvenPayoutCents:
      total !== null && prob !== null && prob > 0
        ? ceilRatio(total, 10000, prob)
        : null,
    maximumFulfillmentCostCents: maximum,
    requiredSuccessProbabilityBps:
      base !== null &&
      payout !== null &&
      x.costOfFailureCents !== null &&
      payout + x.costOfFailureCents > 0
        ? minimumProbability(payout, base, x.costOfFailureCents)
        : null,
    riskAdjustedExpectedValueCents:
      prob !== null && payout !== null && total !== null
        ? floorRatio(payout, prob, 10000) - total
        : null,
  });
}
export const LabSpecSchema = z
  .object({
    platformCostCents: Cents.nullable(),
    costOfFailureCents: Cents.nullable(),
    successProbabilityBps: Bps.nullable(),
    independentVerification: z.boolean(),
    unavailableCapabilities: z.array(z.string()).max(9).default([]),
    // Explicit per-step fixture prices, not live catalog quotes.
    providerPricesCents: z.record(z.string(), Cents).default({}),
  })
  .strict();
export type LabSpec = z.infer<typeof LabSpecSchema>;
const CandidateSchema = z
  .object({
    id: z.string(),
    strategy: z.string(),
    route: ExecutionRouteContractSchema,
    economics: EconomicsSchema,
    decision: DecisionSchema,
    reasons: z.array(z.string()),
    latencySeconds: z.number(),
    reliabilityBps: Bps,
    scenarioBands: z.object({
      optimistic: EconomicsSchema,
      base: EconomicsSchema,
      conservative: EconomicsSchema,
    }),
  })
  .strict();
export const ArbitrageEvaluationSchema = z
  .object({
    version: z.literal("2.0"),
    deterministicVersion: z.literal("underwriter-1"),
    opportunityId: z.string(),
    opportunity: TaskOpportunitySchema,
    mode: z.enum(["observed", "lab"]),
    decision: DecisionSchema,
    economicProvenance: z.enum([
      "simulated_fixture",
      "user_scenario",
      "incomplete",
    ]),
    payout: z
      .object({
        amountCents: Cents.nullable(),
        provenance: z.enum([
          "observed",
          "simulated_fixture",
          "user_scenario",
          "unknown",
        ]),
        confidence: z.string(),
      })
      .strict(),
    policy: ArbitragePolicySchema,
    scenario: ScenarioSchema.nullable(),
    economics: EconomicsSchema,
    risk: z
      .object({
        successProbabilityBps: Bps.nullable(),
        probabilityProvenance: z.enum([
          "unknown",
          "simulated_fixture",
          "user_scenario",
        ]),
        confidence: z.enum(["high", "medium", "low", "unknown"]),
      })
      .strict(),
    candidates: z.array(CandidateSchema).max(3),
    selectedRouteId: z.string().nullable(),
    missingInputs: z.array(z.string()),
    reasons: z.array(z.string()),
    supplyOptions: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            source: z.string(),
            sourceUrl: z.string().url(),
            accessMode: z.string(),
            actionability: z.string(),
            observedAt: z.string().datetime(),
            freshness: FreshnessSchema,
            capabilities: z.array(z.string()),
            rawPriceText: z.string().nullable(),
            unitPriceConfidence: z.string(),
            taskCostCents: z.null(),
            executionStatus: z.literal("execution_not_enabled"),
          })
          .strict(),
      )
      .max(12),
    capabilityCoverage: z
      .object({
        required: z.array(z.string()),
        observedMatches: z.array(z.string()),
      })
      .strict(),
    snapshotVersion: z.string(),
    evaluatedAt: z.string().datetime(),
    decompositionSource: z.literal("deterministic_requirements"),
    executionStatus: z.literal("execution_not_enabled"),
    servicesCalled: z.literal(false),
    paymentsMade: z.literal(false),
    actualSpendCents: z.literal(0),
  })
  .strict();
export type ArbitrageEvaluation = z.infer<typeof ArbitrageEvaluationSchema>;
export function compareEvaluations(
  a: ArbitrageEvaluation,
  b: ArbitrageEvaluation,
) {
  const rank: Record<Decision, number> = {
    profitable: 0,
    marginal: 1,
    uneconomic: 2,
    unroutable: 3,
    insufficient_data: 4,
  };
  return (
    rank[a.decision] - rank[b.decision] ||
    (b.economics.expectedProfitCents ?? -Infinity) -
      (a.economics.expectedProfitCents ?? -Infinity) ||
    a.opportunityId.localeCompare(b.opportunityId)
  );
}
export function classifyEconomics(
  e: Economics,
  policy: ArbitragePolicy,
  probability: number | null,
): { decision: Decision; reasons: string[] } {
  if (e.expectedTotalCostCents === null || e.expectedProfitCents === null)
    return {
      decision: "insufficient_data",
      reasons: ["economic_inputs_missing"],
    };
  const reasons: string[] = [];
  if (e.capitalAtRiskCents === null)
    return {
      decision: "insufficient_data",
      reasons: ["failure_exposure_unknown"],
    };
  if (e.expectedProfitCents < 0) reasons.push("negative_spread");
  if (e.capitalAtRiskCents > policy.maximumCapitalAtRiskCents)
    reasons.push("capital_limit");
  if (
    policy.optimization === "risk_adjusted" &&
    e.riskAdjustedExpectedValueCents === null
  )
    return {
      decision: "insufficient_data",
      reasons: ["success_probability_unknown"],
    };
  if (policy.minimumSuccessProbabilityBps > 0 && probability === null)
    return {
      decision: "insufficient_data",
      reasons: ["success_probability_unknown"],
    };
  if (probability !== null && probability < policy.minimumSuccessProbabilityBps)
    reasons.push("success_below_policy");
  if (
    policy.optimization === "risk_adjusted" &&
    (e.riskAdjustedExpectedValueCents ?? 0) < 0
  )
    reasons.push("negative_risk_adjusted_value");
  if (reasons.length) return { decision: "uneconomic", reasons };
  if (e.expectedProfitCents < policy.minimumExpectedProfitCents)
    reasons.push("profit_below_policy");
  if (
    e.expectedMarginBps === null ||
    e.expectedMarginBps < policy.minimumMarginBps
  )
    reasons.push("margin_below_policy");
  if (e.expectedProfitCents === 0) reasons.push("break_even_only");
  return {
    decision: reasons.length ? "marginal" : "profitable",
    reasons: reasons.length ? reasons : ["policy_satisfied"],
  };
}
export function evaluateArbitrage(
  rawTask: unknown,
  rawInput: unknown,
  options: {
    lab?: LabSpec;
    supply?: CatalogService[];
    now?: string;
    snapshotVersion?: string;
  } = {},
): ArbitrageEvaluation {
  const task = TaskOpportunitySchema.parse(rawTask),
    input = ArbitrageInputSchema.parse(rawInput),
    policy = input.policy;
  const mode = task.freshness === "simulated_demo" ? "lab" : "observed";
  if (input.opportunityId !== task.id) throw new Error("opportunity_mismatch");
  if (options.lab && mode !== "lab")
    throw new Error("observed_cannot_use_fixture");
  const lab = options.lab ? LabSpecSchema.parse(options.lab) : undefined;
  const published =
    task.payout.currency === "USD" &&
    task.payout.parseConfidence === "exact" &&
    task.payout.amountUsd !== undefined
      ? usdToCents(task.payout.amountUsd)
      : null;
  const payout = input.scenario?.payoutCents ?? published;
  const probability =
    input.scenario?.successProbabilityBps ?? lab?.successProbabilityBps ?? null;
  const empty = calculateEconomics(
    {
      payoutCents: payout,
      executionCostCents: null,
      verificationCostCents: null,
      platformCostCents: lab?.platformCostCents ?? null,
      costOfFailureCents: lab?.costOfFailureCents ?? null,
      successProbabilityBps: probability,
    },
    policy,
  );
  const missing: string[] = [];
  if (payout === null) missing.push("payout_unknown");
  if (!lab)
    missing.push(
      "task_cost_unavailable",
      "platform_fee_unknown",
      "failure_exposure_unknown",
      "execution_eligibility_unknown",
    );
  if (lab?.platformCostCents === null) missing.push("platform_fee_unknown");
  if (lab?.costOfFailureCents === null)
    missing.push("failure_exposure_unknown");
  if (
    mode === "observed" &&
    Date.parse(options.now ?? new Date().toISOString()) -
      Date.parse(task.observedAt) >
      86400000
  )
    missing.push("stale_observation");
  if (probability === null) missing.push("success_probability_unknown");
  if (!policy.allowedFreshness.includes(task.freshness))
    missing.push("freshness_disallowed");
  if (!policy.allowedSourceModes.includes(mode))
    missing.push("source_mode_disallowed");
  const confidence = lab ? "medium" : "unknown";
  if (!policy.allowedConfidence.includes(confidence))
    missing.push("confidence_disallowed");
  const supplyOptions = (options.supply ?? [])
    .filter(
      (s) =>
        ["live", "cached_live"].includes(s.freshness) &&
        s.capabilities.some((c) => task.requiredCapabilities.includes(c)),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 12)
    .map((s) => ({
      id: s.id,
      name: s.name,
      source: s.sourceName,
      sourceUrl: s.sourceUrl,
      accessMode: s.accessMode,
      actionability: s.access.actionability,
      observedAt: s.observedAt,
      freshness: s.freshness,
      capabilities: s.capabilities,
      rawPriceText: s.pricing.rawPriceText ?? null,
      unitPriceConfidence: s.pricing.parseConfidence,
      taskCostCents: null,
      executionStatus: "execution_not_enabled" as const,
    }));
  const candidates: ArbitrageEvaluation["candidates"] = [];
  if (lab) {
    const offers = serviceOffers.map((o) => ({
      ...o,
      pricePerCallUsd:
        (lab.providerPricesCents[o.providerId] ??
          Math.round(o.pricePerCallUsd * 100)) / 100,
      capabilities: o.capabilities.filter(
        (c) => !lab.unavailableCapabilities.includes(c),
      ),
    }));
    for (const strategy of ["cheapest", "most_verified", "fastest"] as const) {
      const independent =
        policy.requireIndependentVerification ||
        lab.independentVerification ||
        strategy === "most_verified";
      const objective =
        task.description +
        (independent ? " Require independent verification." : "");
      const routeInput: ObjectiveInput = {
        objective,
        budgetUsd: policy.maximumRouteCostCents / 100,
        optimizationPolicy: strategy,
        mode: "demo",
      };
      const frame = decomposeObjective(routeInput);
      for (const id of task.requiredCapabilities) {
        const existing = frame.requiredCapabilities.find((c) => c.id === id);
        if (existing) existing.priority = "critical";
        else
          frame.requiredCapabilities.push({
            id,
            label: id,
            purpose: "Required by opportunity",
            priority: "critical",
            dependencies: [],
          });
      }
      const evidence = frame.requiredCapabilities
        .filter((c) => c.id !== "synthesis" && c.id !== "claim_verification")
        .map((c) => c.id);
      const verifier = frame.requiredCapabilities.find(
        (c) => c.id === "claim_verification",
      );
      if (verifier) verifier.dependencies = evidence;
      const synthesis = frame.requiredCapabilities.find(
        (c) => c.id === "synthesis",
      );
      if (synthesis)
        synthesis.dependencies = verifier ? ["claim_verification"] : evidence;
      frame.constraints.maxLatencySeconds = policy.maximumLatencySeconds;
      const route = buildExecutionRoute(routeInput, frame, {
        id: `arb_${task.id.replace(/[^a-zA-Z0-9_-]/g, "_")}_${strategy}`,
        createdAt: task.observedAt,
        offers,
      });
      if (
        candidates.some(
          (c) =>
            JSON.stringify(c.route.route.map((s) => s.selectedProvider.id)) ===
            JSON.stringify(route.route.map((s) => s.selectedProvider.id)),
        )
      )
        continue;
      const execution = route.route
        .filter((s) => s.capability !== "claim_verification")
        .reduce(
          (n, s) => n + Math.round(s.selectedProvider.estimatedCostUsd * 100),
          0,
        );
      const verification = route.route
        .filter((s) => s.capability === "claim_verification")
        .reduce(
          (n, s) => n + Math.round(s.selectedProvider.estimatedCostUsd * 100),
          0,
        );
      const costs = {
        payoutCents: payout,
        executionCostCents: execution,
        verificationCostCents: verification,
        platformCostCents: lab.platformCostCents,
        costOfFailureCents: lab.costOfFailureCents,
        successProbabilityBps: probability,
      };
      const economics = calculateEconomics(costs, policy);
      if (route.status === "partial") {
        economics.expectedProfitCents = null;
        economics.expectedMarginBps = null;
        economics.riskAdjustedExpectedValueCents = null;
        economics.breakEvenPayoutCents = null;
      }
      const decision =
        route.status === "partial"
          ? {
              decision: "unroutable" as const,
              reasons: ["critical_capability_missing"],
            }
          : classifyEconomics(economics, policy, probability);
      candidates.push({
        id: route.routeId,
        strategy,
        route,
        economics,
        ...decision,
        latencySeconds: route.route.reduce(
          (n, s) => n + s.selectedProvider.estimatedLatencySeconds,
          0,
        ),
        reliabilityBps: Math.round(
          Math.min(
            ...route.route.map((s) => s.selectedProvider.reliabilityScore),
            1,
          ) * 10000,
        ),
        scenarioBands: {
          base: economics,
          optimistic:
            route.status === "partial"
              ? economics
              : calculateEconomics(
                  {
                    ...costs,
                    executionCostCents: floorRatio(execution, 90, 100),
                  },
                  policy,
                ),
          conservative:
            route.status === "partial"
              ? economics
              : calculateEconomics(
                  {
                    ...costs,
                    executionCostCents: ceilRatio(execution, 120, 100),
                  },
                  policy,
                ),
        },
      });
    }
  }
  const rank: Record<Decision, number> = {
    profitable: 0,
    marginal: 1,
    uneconomic: 2,
    insufficient_data: 3,
    unroutable: 4,
  };
  candidates.sort(
    (a, b) =>
      rank[a.decision] - rank[b.decision] ||
      (policy.optimization === "fastest"
        ? a.latencySeconds - b.latencySeconds
        : policy.optimization === "highest_reliability"
          ? b.reliabilityBps - a.reliabilityBps
          : policy.optimization === "risk_adjusted"
            ? (b.economics.riskAdjustedExpectedValueCents ?? -Infinity) -
              (a.economics.riskAdjustedExpectedValueCents ?? -Infinity)
            : (a.economics.expectedTotalCostCents ?? Infinity) -
              (b.economics.expectedTotalCostCents ?? Infinity)) ||
      a.id.localeCompare(b.id),
  );
  const selected = candidates[0];
  const blocking = missing.filter((m) => m !== "success_probability_unknown");
  const decision = blocking.length
    ? "insufficient_data"
    : (selected?.decision ?? "insufficient_data");
  return ArbitrageEvaluationSchema.parse({
    version: "2.0",
    deterministicVersion: "underwriter-1",
    opportunityId: task.id,
    opportunity: task,
    mode,
    decision,
    economicProvenance: !lab
      ? "incomplete"
      : input.scenario
        ? "user_scenario"
        : "simulated_fixture",
    payout: {
      amountCents: payout,
      provenance:
        input.scenario?.payoutCents !== undefined
          ? "user_scenario"
          : published === null
            ? "unknown"
            : mode === "lab"
              ? "simulated_fixture"
              : "observed",
      confidence: task.payout.parseConfidence,
    },
    policy,
    scenario: input.scenario ?? null,
    economics: selected?.economics ?? empty,
    risk: {
      successProbabilityBps: probability,
      probabilityProvenance:
        input.scenario?.successProbabilityBps !== undefined
          ? "user_scenario"
          : probability !== null
            ? "simulated_fixture"
            : "unknown",
      confidence,
    },
    candidates,
    selectedRouteId: selected?.id ?? null,
    missingInputs: missing,
    reasons: blocking.length
      ? blocking
      : (selected?.reasons ?? ["economic_inputs_missing"]),
    supplyOptions,
    capabilityCoverage: {
      required: task.requiredCapabilities,
      observedMatches: [
        ...new Set(
          supplyOptions
            .flatMap((s) => s.capabilities)
            .filter((c) =>
              task.requiredCapabilities.includes(c as CapabilityId),
            ),
        ),
      ],
    },
    snapshotVersion: options.snapshotVersion ?? "lab-v1",
    evaluatedAt: options.now ?? task.observedAt,
    decompositionSource: "deterministic_requirements",
    executionStatus: "execution_not_enabled",
    servicesCalled: false,
    paymentsMade: false,
    actualSpendCents: 0,
  });
}
