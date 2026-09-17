import { z } from "zod";
import {
  ArbitragePolicySchema,
  DecisionSchema,
  EconomicsSchema,
  calculateEconomics,
} from "./arbitrage";
import { capabilityIds, ObjectiveInputSchema } from "./objective";
import { PlanningResponseSchema } from "./planning-response";

const MoneyTextSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/, "Use a non-negative USD amount with at most two decimals.")
  .refine((value) => decimalUsdToCents(value) <= 1_000_000, "USD amount is too large.");

const OptionalMoneyTextSchema = z.union([MoneyTextSchema, z.literal("")]);

export const ForgeUnderwritingInputSchema = z
  .object({
    clientRunId: z.string().uuid().optional(),
    objective: ObjectiveInputSchema,
    locale: z.enum(["en", "es", "fr"]).default("en"),
    scenario: z
      .object({
        payoutUsd: OptionalMoneyTextSchema.optional(),
        fulfillmentCostUsd: OptionalMoneyTextSchema.optional(),
        successProbabilityBps: z.number().int().min(0).max(10_000),
        humanReviewCostUsd: MoneyTextSchema,
        verificationCostUsd: MoneyTextSchema,
        platformCostUsd: MoneyTextSchema,
        failureCostUsd: MoneyTextSchema,
        refundableCapitalUsd: OptionalMoneyTextSchema.optional(),
        minimumMarginBps: z.number().int().min(0).max(10_000).default(2_500),
      })
      .strict(),
  })
  .strict();

export type ForgeUnderwritingInput = z.infer<typeof ForgeUnderwritingInputSchema>;

const ProvenancedCentsSchema = z
  .object({
    valueCents: z.number().int().nonnegative().nullable(),
    provenance: z.enum(["user_scenario", "unknown"]),
  })
  .strict();

export const ForgeRouteEvidenceSchema = z
  .object({
    status: z.enum(["context_available", "coverage_incomplete", "catalog_degraded"]),
    capabilities: z.array(
      z
        .object({
          capability: z.enum(capabilityIds),
          priority: z.enum(["critical", "high", "medium", "low"]),
          observedOptionIds: z.array(z.string()).max(8),
          coveredByObservedContext: z.boolean(),
        })
        .strict(),
    ),
    boundary: z.literal("observed_context_only_not_a_route_quote"),
  })
  .strict();

export const ForgeEconomicScenarioSchema = z
  .object({
    payout: ProvenancedCentsSchema,
    fulfillmentCost: ProvenancedCentsSchema,
    successProbability: z
      .object({ valueBps: z.number().int().min(0).max(10_000), provenance: z.literal("user_scenario") })
      .strict(),
    humanReviewCost: ProvenancedCentsSchema,
    verificationCost: ProvenancedCentsSchema,
    platformCost: ProvenancedCentsSchema,
    failureCost: ProvenancedCentsSchema,
    refundableCapital: ProvenancedCentsSchema,
    minimumMargin: z
      .object({ valueBps: z.number().int().min(0).max(10_000), provenance: z.literal("user_scenario") })
      .strict(),
  })
  .strict();

export const ForgeFinancialExposureSchema = z
  .object({
    expectedTotalCostCents: z.number().int().nonnegative().nullable(),
    refundableCapitalCents: z.number().int().nonnegative().nullable(),
    capitalRequiredCents: z.number().int().nonnegative().nullable(),
    refundableCapitalIsExpense: z.literal(false),
  })
  .strict();

export const ForgeReceiptCoreSchema = z
  .object({
    receiptSchemaVersion: z.literal("forge-underwriting/1.0"),
    economicModelVersion: z.literal("deterministic-cents/1.0"),
    policyVersion: z.literal("forge-policy/1.0"),
    objectiveFrame: PlanningResponseSchema.shape.objectiveFrame,
    routeEvidence: ForgeRouteEvidenceSchema,
    scenario: ForgeEconomicScenarioSchema,
    economics: EconomicsSchema,
    financialExposure: ForgeFinancialExposureSchema,
    decision: DecisionSchema,
    blockers: z.array(z.string().max(160)).max(20),
    limitations: z.array(z.string().max(160)).max(20),
    observedOptions: PlanningResponseSchema.shape.route.shape.observedSupply,
    calculationMetadata: z
      .object({
        monetaryUnit: z.literal("USD_CENTS"),
        catalogContextIsTaskQuote: z.literal(false),
        serverAuthoritative: z.literal(true),
      })
      .strict(),
    executionStatus: z.literal("execution_not_enabled"),
    servicesCalled: z.literal(false),
    paymentsMade: z.literal(false),
  })
  .strict();

export const ForgeUnderwritingResponseSchema = z
  .object({
    version: z.literal("1.0"),
    clientRunId: z.string().uuid(),
    saveAuthorization: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    planning: PlanningResponseSchema,
    scenario: ForgeEconomicScenarioSchema,
    routeEvidence: ForgeRouteEvidenceSchema,
    economics: EconomicsSchema,
    financialExposure: ForgeFinancialExposureSchema,
    decision: DecisionSchema,
    blockers: z.array(z.string().max(160)).max(20),
    limitations: z.array(z.string().max(160)).max(20),
    receipt: z
      .object({
        core: ForgeReceiptCoreSchema,
        receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
        hashAlgorithm: z.literal("SHA-256/canonical-json-v2"),
        receiptFingerprintIsSignature: z.literal(false),
      })
      .strict(),
    executionStatus: z.literal("execution_not_enabled"),
    persistence: z.object({
      status: z.enum(["guest", "saved", "failed"]),
      savedRunId: z.string().uuid().nullable(),
    }).strict(),
  })
  .strict();

export type ForgeUnderwritingResponse = z.infer<typeof ForgeUnderwritingResponseSchema>;

export function decimalUsdToCents(value: string): number {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("invalid_money");
  return Number(BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0")));
}

const scenarioMoney = (value: string | undefined) => ({
  valueCents: !value ? null : decimalUsdToCents(value),
  provenance: !value ? ("unknown" as const) : ("user_scenario" as const),
});

export function evaluateForgeScenario(
  raw: ForgeUnderwritingInput,
  planning: z.infer<typeof PlanningResponseSchema>,
) {
  const input = ForgeUnderwritingInputSchema.parse(raw);
  const plan = PlanningResponseSchema.parse(planning);
  const scenario = ForgeEconomicScenarioSchema.parse({
    payout: scenarioMoney(input.scenario.payoutUsd),
    fulfillmentCost: scenarioMoney(input.scenario.fulfillmentCostUsd),
    successProbability: {
      valueBps: input.scenario.successProbabilityBps,
      provenance: "user_scenario",
    },
    humanReviewCost: scenarioMoney(input.scenario.humanReviewCostUsd),
    verificationCost: scenarioMoney(input.scenario.verificationCostUsd),
    platformCost: scenarioMoney(input.scenario.platformCostUsd),
    failureCost: scenarioMoney(input.scenario.failureCostUsd),
    refundableCapital: scenarioMoney(input.scenario.refundableCapitalUsd),
    minimumMargin: {
      valueBps: input.scenario.minimumMarginBps,
      provenance: "user_scenario",
    },
  });

  // The route projection already filters the network snapshot down to service
  // and agent catalog context. Task-market observations alone must not make
  // fulfillment supply appear available.
  const sourceAvailable = plan.route.observedSupply.length > 0;
  const capabilities = plan.objectiveFrame.requiredCapabilities.map((capability) => {
    const observedOptionIds = plan.route.observedSupply
      .filter((option) => option.capabilities.includes(capability.id))
      .map((option) => option.id);
    return {
      capability: capability.id,
      priority: capability.priority,
      observedOptionIds,
      coveredByObservedContext: observedOptionIds.length > 0,
    };
  });
  const criticalCoverageMissing = capabilities.some(
    (capability) => capability.priority === "critical" && !capability.coveredByObservedContext,
  );
  const routeEvidence = ForgeRouteEvidenceSchema.parse({
    status: !sourceAvailable
      ? "catalog_degraded"
      : criticalCoverageMissing
        ? "coverage_incomplete"
        : "context_available",
    capabilities,
    boundary: "observed_context_only_not_a_route_quote",
  });

  const fulfillment = scenario.fulfillmentCost.valueCents;
  const human = scenario.humanReviewCost.valueCents;
  const executionCost = fulfillment === null || human === null ? null : fulfillment + human;
  const policy = ArbitragePolicySchema.parse({
    minimumMarginBps: scenario.minimumMargin.valueBps,
    minimumExpectedProfitCents: 0,
    maximumRouteCostCents: Math.round(input.objective.budgetUsd * 100),
    maximumCapitalAtRiskCents: Math.round(input.objective.budgetUsd * 100),
  });
  const economics = calculateEconomics(
    {
      payoutCents: scenario.payout.valueCents,
      executionCostCents: executionCost,
      verificationCostCents: scenario.verificationCost.valueCents,
      platformCostCents: scenario.platformCost.valueCents,
      costOfFailureCents: scenario.failureCost.valueCents,
      successProbabilityBps: scenario.successProbability.valueBps,
    },
    policy,
  );
  const blockers = [
    ...(scenario.payout.valueCents === null ? ["payout_unknown"] : []),
    ...(scenario.fulfillmentCost.valueCents === null ? ["fulfillment_cost_unknown"] : []),
  ];
  const limitations = [
    ...(routeEvidence.status === "catalog_degraded"
      ? ["observed_catalog_unavailable"]
      : []),
    ...(routeEvidence.status === "coverage_incomplete"
      ? ["observed_capability_context_incomplete"]
      : []),
    "no_executable_route_candidate_set",
  ];
  const budgetCents = Math.round(input.objective.budgetUsd * 100);
  const exceedsBudget = economics.expectedTotalCostCents !== null && economics.expectedTotalCostCents > budgetCents;
  if (exceedsBudget) blockers.push("hard_budget_exceeded");

  const financialExposure = ForgeFinancialExposureSchema.parse({
    expectedTotalCostCents: economics.expectedTotalCostCents,
    refundableCapitalCents: scenario.refundableCapital.valueCents,
    capitalRequiredCents:
      economics.expectedTotalCostCents === null ||
      scenario.refundableCapital.valueCents === null
        ? null
        : economics.expectedTotalCostCents +
          scenario.refundableCapital.valueCents,
    refundableCapitalIsExpense: false,
  });

  let decision: z.infer<typeof DecisionSchema> = "insufficient_data";
  if (exceedsBudget) decision = "unroutable";
  else if (
    blockers.length === 0 &&
    economics.expectedProfitCents !== null &&
    economics.expectedMarginBps !== null &&
    economics.riskAdjustedExpectedValueCents !== null
  ) {
    decision =
      economics.expectedProfitCents < 0 || economics.riskAdjustedExpectedValueCents < 0
        ? "conditionally_uneconomic"
        : economics.expectedMarginBps < scenario.minimumMargin.valueBps
          ? "conditionally_marginal"
          : "conditionally_profitable";
  }
  return {
    scenario,
    routeEvidence,
    economics,
    financialExposure,
    decision,
    blockers,
    limitations,
  };
}
